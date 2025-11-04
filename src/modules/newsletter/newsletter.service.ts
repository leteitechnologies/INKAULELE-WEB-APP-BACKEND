// src/newsletter/newsletter.service.ts
import { Injectable, InternalServerErrorException, ConflictException } from '@nestjs/common';

import { MailerService } from '../mailer/mailer.service';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class NewsletterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {}

  private genToken(length = 24) {
    return randomBytes(length).toString('hex');
  }

  /**
   * Subscribe a user: create or update subscriber row, then send emails.
   * returns the subscriber record.
   */
  async subscribe(email: string, opts?: { name?: string; source?: string }) {
    const trimmed = email.trim().toLowerCase();

    try {
      // Upsert: if exists, update fields; else create
      const subscriber = await this.prisma.subscriber.upsert({
        where: { email: trimmed },
        update: {
          name: opts?.name ?? undefined,
          status: 'SUBSCRIBED',         // you can set 'PENDING' if you want verification flow
          verified: true,               // toggle based on whether you require verification
          verifiedAt: new Date(),
          unsubToken: this.genToken(12),
          notes: 'Subscribed via site',
          // keep createdAt as-is when updating; upsert won't change createdAt automatically
        },
        create: {
          email: trimmed,
          name: opts?.name,
          status: 'SUBSCRIBED',
          verified: true,
          verifyToken: this.genToken(12),
          unsubToken: this.genToken(12),
          source: opts?.source ?? 'site:cta',
          notes: 'New subscriber',
        },
      });

      // call existing MailerService to send admin + confirmation
      await this.mailer.sendSubscriptionEmails(trimmed);

      return subscriber;
    } catch (err: any) {
      // Prisma unique constraint errors could be handled specially if desired
      // but upsert will avoid most duplicate issues.
      console.error('Newsletter subscribe error:', err);
      throw new InternalServerErrorException('Failed to create subscriber');
    }
  }
}
