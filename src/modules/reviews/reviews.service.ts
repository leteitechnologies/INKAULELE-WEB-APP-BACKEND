import { Injectable, BadRequestException, ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import * as crypto from 'crypto';
import sanitizeHtml from 'sanitize-html';
import fetch from 'node-fetch'; 
import { CreateReviewDto } from './dtos/create-review.dto';
import { MailerService } from '../mailer/mailer.service';
import { UpdateReviewDto } from './dtos/update-review.dto';

@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService, private mailer: MailerService) {}

  private sha256(input: string) {
    return crypto.createHash('sha256').update(input).digest('hex');
  }

  private genToken() {
    return crypto.randomBytes(28).toString('hex'); // 56 chars
  }

  private timingSafeEquals(a: string, b: string) {
    try {
      const A = Buffer.from(a, 'utf8');
      const B = Buffer.from(b, 'utf8');
      if (A.length !== B.length) return false;
      return crypto.timingSafeEqual(A, B);
    } catch {
      return false;
    }
  }

  private async verifyRecaptcha(token?: string, remoteip?: string) {
    const secret = process.env.RECAPTCHA_SECRET;
    if (!secret) return true; // allow if not configured (but recommend enabling)
    if (!token) return false;
    const res = await fetch(`https://www.google.com/recaptcha/api/siteverify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(token)}${remoteip ? `&remoteip=${encodeURIComponent(remoteip)}` : ''}`
    });
    const data = await res.json();
    return data.success === true && (data.score ? data.score > 0.3 : true);
  }

  private async runSpamChecks(payload: { text: string; email?: string; ip?: string }) {
    // Placeholder: implement Akismet, ML model, profanity lists
    // Return true if suspicious
    const lowQuality = payload.text.length < 10 || /http(s)?:\/\//.test(payload.text) && payload.text.length < 50;
    return lowQuality;
  }

  private sanitize(input: string) {
    return sanitizeHtml(input, {
      allowedTags: ['b', 'i', 'em', 'strong', 'a', 'br', 'p'],
      allowedAttributes: { a: ['href', 'rel', 'target'] },
      allowedSchemes: ['http', 'https', 'mailto'],
    });
  }

  /** Create review by destination slug */
  async createBySlug(slug: string, dto: CreateReviewDto, ip?: string, ua?: string) {
    const dest = await this.prisma.destination.findUnique({ where: { slug } });
    
    if (!dest) throw new BadRequestException('Destination not found');

    // recaptcha
    const recaptchaOk = await this.verifyRecaptcha(dto.recaptchaToken, ip);
    if (!recaptchaOk) throw new BadRequestException('Recaptcha failed');

    // sanitize and clamp
    const text = this.sanitize(dto.text);
    const rating = Math.max(0, Math.min(5, dto.rating));

    // spam checks
    const suspicious = await this.runSpamChecks({ text, email: dto.email, ip });

    // token
    const rawToken = this.genToken();
    const deleteTokenHash = this.sha256(rawToken);
    const ipHash = ip ? this.sha256(ip) : null;

    // create review and update destination aggregates inside transaction
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const review = await tx.review.create({
          data: {
            destinationId: dest.id,
            author: dto.author,
            avatar: dto.avatar ?? null,
            email: dto.email ?? null,
            rating,
            text,
            status: suspicious ? 'PENDING' : 'APPROVED',
            deleteTokenHash,
            ipHash,
            userAgent: ua ?? null,
          },
        });

        // Update aggregates only if APPROVED (if PENDING, skip)
        if (!suspicious) {
          // recompute aggregates or use incremental update
    
const agg = await tx.review.aggregate({
  where: ({ destinationId: dest.id, status: 'APPROVED' } as any),
  _avg: { rating: true },
  _count: { id: true },
});

// defensive read
const avgRating = Number((agg as any)?._avg?.rating ?? 0);
const total = Number((agg as any)?._count?.id ?? 0);

// update using a parameterized raw query to avoid Prisma typing mismatch
await tx.$executeRaw`UPDATE "Destination" SET "rating" = ${avgRating}, "reviewCount" = ${total} WHERE id = ${dest.id}`;


          await tx.destination.update({
            where: { id: dest.id },
            data: {
              rating: avgRating,
              reviewCount: total,
            },
          });
        }

        return review;
      });

      // deliver token: if email provided send email; otherwise return token to client
      if (dto.email) {
        const actionUrl = `${process.env.FRONTEND_URL?.replace(/\/$/, '')}/review-action?reviewId=${created.id}&token=${rawToken}`;
        const bodyHtml = `
          <p>Thanks for your review on ${this.escape(dest.title || slug)}.</p>
          <p>If you want to delete or edit your review later, click the button below. This link allows you to delete or edit your review without an account.</p>
        `;
        const html = this.mailer.buildLayout({
          title: `Your review on ${dest.title ?? slug}`,
          preheader: 'Manage your review',
          bodyHtml,
          cta: { label: 'Manage your review', url: actionUrl },
          footerNote: 'If you did not post this review, ignore this email.'
        });

        try {
          await this.mailer.sendMail({
            from: `"${process.env.SITE_TITLE}" <${process.env.EMAIL_USER}>`,
            to: dto.email,
            subject: `Manage your review on ${dest.title ?? slug}`,
            html,
          });
        } catch (err) {
          // log but do not fail creation
          console.error('Failed to send deletion email', err);
        }
        return { review: created, deletionTokenDisplayed: false };
      }

      // no email -> return raw token so client can show it once
      return { review: created, deletionTokenDisplayed: true, deletionToken: rawToken };
    } catch (err) {
      console.error(err);
      throw new InternalServerErrorException('Failed to create review');
    }
  }

  /** Delete by id and raw token */
  async deleteById(reviewId: string, token: string) {
    if (!token) throw new BadRequestException('Missing token');
    const review = await this.prisma.review.findUnique({ where: { id: reviewId }});
    if (!review) throw new BadRequestException('Not found');

    const tokenHash = this.sha256(token);
    if (!review.deleteTokenHash || !this.timingSafeEquals(tokenHash, review.deleteTokenHash)) {
      throw new ForbiddenException('Invalid token');
    }

    // delete and update aggregates in tx if the review was APPROVED
    await this.prisma.$transaction(async (tx) => {
      await tx.review.delete({ where: { id: reviewId }});
      if (review.status === 'APPROVED') {
const agg = await tx.review.aggregate({
  where: ({ destinationId: review.destinationId, status: 'APPROVED' } as any),
  _avg: { rating: true },
  _count: { id: true },
});

const avgRating = Number((agg as any)?._avg?.rating ?? 0);
const total = Number((agg as any)?._count?.id ?? 0);

await tx.$executeRaw`UPDATE "Destination" SET "rating" = ${avgRating}, "reviewCount" = ${total} WHERE id = ${review.destinationId}`;

        await tx.destination.update({
          where: { id: review.destinationId },
          data: { rating: avgRating, reviewCount: total },
        });
      }
    });

    return { ok: true };
  }

  /** Edit using token */
  async updateById(reviewId: string, dto: UpdateReviewDto) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId }});
    if (!review) throw new BadRequestException('Not found');
    if (!dto.token) throw new BadRequestException('Missing token');

    const tokenHash = this.sha256(dto.token);
    if (!review.deleteTokenHash || !this.timingSafeEquals(tokenHash, review.deleteTokenHash)) {
      throw new ForbiddenException('Invalid token');
    }

    const updates: any = {};
    if (dto.text) updates.text = this.sanitize(dto.text);
    if (typeof dto.rating === 'number') updates.rating = Math.max(0, Math.min(5, dto.rating));

    // apply update and recalc aggregates if the review is APPROVED
    const updated = await this.prisma.$transaction(async (tx) => {
      const r = await tx.review.update({ where: { id: reviewId }, data: updates });

      if (r.status === 'APPROVED') {
  const agg = await tx.review.aggregate({
  where: ({ destinationId: r.destinationId, status: 'APPROVED' } as any),
  _avg: { rating: true },
  _count: { id: true },
});
const avgRating = Number((agg as any)?._avg?.rating ?? 0);
const total = Number((agg as any)?._count?.id ?? 0);

await tx.$executeRaw`UPDATE "Destination" SET "rating" = ${avgRating}, "reviewCount" = ${total} WHERE id = ${r.destinationId}`;

        await tx.destination.update({ where: { id: r.destinationId }, data: { rating: avgRating, reviewCount: total }});
      }
      return r;
    });

    return updated;
  }

  /** Admin approve/reject (requires admin guard) */
  async setStatus(reviewId: string, status: 'APPROVED' | 'REJECTED') {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId }});
    if (!review) throw new BadRequestException('Not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.review.update({ where: { id: reviewId }, data: { status }});

      // Recalculate aggregates if APPROVED or if moving from APPROVED away
const agg = await tx.review.aggregate({
  where: ({ destinationId: review.destinationId, status: 'APPROVED' } as any),
  _avg: { rating: true },
  _count: { id: true },
});
const avgRating = Number((agg as any)?._avg?.rating ?? 0);
const total = Number((agg as any)?._count?.id ?? 0);

await tx.$executeRaw`UPDATE "Destination" SET "rating" = ${avgRating}, "reviewCount" = ${total} WHERE id = ${review.destinationId}`;

      await tx.destination.update({ where: { id: review.destinationId }, data: { rating: avgRating, reviewCount: total }});
    });

    return { ok: true };
  }

  /** list public reviews for slug */
  async listForSlug(slug: string, take = 50, page = 1) {
    const dest = await this.prisma.destination.findUnique({ where: { slug }});
    if (!dest) throw new BadRequestException('Destination not found');

const reviews = await this.prisma.review.findMany({
  where: ({ destinationId: dest.id, status: 'APPROVED' } as any),
  orderBy: { createdAt: 'desc' },
  take,
  skip: (page - 1) * take,
});

    return reviews;
  }

  private escape(input: string): string {
    return String(input || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
