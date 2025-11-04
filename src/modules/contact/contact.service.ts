// src/modules/contact/contact.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import crypto from 'crypto';

import type { CreateContactDto } from './dto/create-contact.dto';

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(private readonly prisma: PrismaService, private readonly mailer: MailerService) {}

  private parseHostField(host: any): { email?: string | null; phone?: string | null; name?: string | null } {
    if (host == null) return {};
    let obj: any = host;

    if (typeof host === 'string' || host instanceof String) {
      try {
        obj = JSON.parse(String(host));
      } catch (err) {
        this.logger.debug('parseHostField: host is string but JSON.parse failed (non-JSON string).', {
          preview: String(host).slice(0, 200),
          err: (err as any)?.message ?? err,
        });
        return {};
      }
    }

    if (typeof obj !== 'object' || obj === null) {
      this.logger.debug('parseHostField: host is not an object after parsing', {
        type: typeof obj,
        preview: String(obj).slice(0, 200),
      });
      return {};
    }

    const pick = (...keys: Array<string | undefined>) => {
      for (const k of keys) {
        if (!k) continue;
        const parts = k.split('.');
        let cur: any = obj;
        let found = true;
        for (const p of parts) {
          if (cur && Object.prototype.hasOwnProperty.call(cur, p)) {
            cur = cur[p];
          } else {
            found = false;
            break;
          }
        }
        if (found && (cur !== undefined && cur !== null && cur !== '')) return cur;
      }
      return undefined;
    };

    const rawEmail = pick(
      'email',
      'contact_email',
      'contact.email',
      'contact.emailAddress',
      'contact.email_address',
      'emailAddress',
      'contact_info.email'
    );
    const rawPhone = pick('phone', 'contact_phone', 'contact.phone', 'phoneNumber', 'phone_number', 'contact_info.phone');
    const rawName = pick('name', 'displayName', 'fullName', 'full_name', 'contact.name');

    const email = rawEmail ? String(rawEmail).trim() : null;
    const phone = rawPhone ? String(rawPhone).trim() : null;
    const name = rawName ? String(rawName).trim() : null;

    return { email: email || null, phone: phone || null, name: name || null };
  }

  private hashIp(ip?: string) {
    if (!ip) return null;
    return crypto.createHash('sha256').update(String(ip)).digest('hex');
  }

  private escape(input: any) {
    return String(input ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private isEmailLike(e?: string | null): e is string {
    if (!e) return false;
    const s = String(e).trim();
    if (!s) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }

  async createContact(dto: CreateContactDto, meta: { ip?: string; userAgent?: string }) {
    // defensive: coerce DTO shape (avoid runtime undefined errors)
    dto = dto ?? ({} as CreateContactDto);

    const ipHash = this.hashIp(meta.ip);

    // Defensive message validation — controller should already enforce this.
    const message = typeof dto.message === 'string' ? String(dto.message).trim() : '';
    if (!message) {
      this.logger.warn('createContact called without a message — rejecting', {
        dtoPreview: {
          hostType: dto.hostType,
          hostId: dto.hostId,
          hostName: dto.hostName,
          name: dto.name,
          email: dto.email,
          phone: dto.phone,
          reason: dto.reason,
          priority: dto.priority,
          message: String(dto.message ?? '').slice(0, 120),
        },
      });
      throw new Error('Missing message in CreateContactDto');
    }

    // Build data object explicitly so we can log it and control undefined/null
    const dataToSave = {
      hostType: dto.hostType ?? null,
      hostId: dto.hostId ?? null,
      hostName: dto.hostName ?? null,
      name: dto.name ?? null,
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      reason: dto.reason ?? null,
      priority: dto.priority ?? null,
      message,
      ipHash,
      userAgent: meta.userAgent ?? null,
    };

    // Log the values we intend to save (safe to stringify because small)
    try {
      this.logger.debug('createContact: dataToSave (before prisma.create)', JSON.parse(JSON.stringify(dataToSave)));
    } catch {
      this.logger.debug('createContact: dataToSave (before prisma.create) [unstringifiable]');
    }

    // Persist
    let record: any;
    try {
      record = await this.prisma.contactRequest.create({ data: dataToSave });
      this.logger.debug('Prisma saved contact:', {
        id: record.id,
        name: record.name,
        email: record.email,
        phone: record.phone,
        reason: record.reason,
        priority: record.priority,
        message: record.message,
      });
    } catch (err) {
      this.logger.error('Prisma createContact failed', (err as any)?.message ?? err);
      throw err;
    }

    // Enrichment block remains the same — use dto as originally provided
    let objectTitle = dto.hostName ?? '';
    let hostEmail: string | null = null;
    let hostPhone: string | null = null;
    let hostLink = '';

    try {
      if (dto.hostType === 'experience' && dto.hostId) {
        const exp = await this.prisma.experience.findFirst({
          where: { OR: [{ id: dto.hostId }, { slug: dto.hostId }] },
          select: { title: true, host: true, slug: true },
        });

        this.logger.debug('ContactService: fetched experience for enrichment', {
          idOrSlug: dto.hostId,
          found: Boolean(exp),
        });

        if (exp) {
          objectTitle = objectTitle || exp.title;
          hostLink = `${process.env.SITE_URL ?? ''}/experiences/${exp.slug ?? exp.title}`;
          this.logger.debug('ContactService: experience.host preview', {
            type: typeof exp.host,
            preview: String(exp.host).slice(0, 300),
          });

          const parsed = this.parseHostField(exp.host);
          if (parsed.email) hostEmail = parsed.email.toLowerCase();
          if (parsed.phone) hostPhone = parsed.phone;
          if (!dto.hostName && parsed.name) objectTitle = parsed.name;
        }
      } else if (dto.hostType === 'destination' && dto.hostId) {
        const dest = await this.prisma.destination.findFirst({
          
          where: { OR: [{ id: dto.hostId }, { slug: dto.hostId }] },
          select: { title: true, host: true, slug: true },
        });

        this.logger.debug('ContactService: fetched destination for enrichment', {
          idOrSlug: dto.hostId,
          found: Boolean(dest),
        });

        if (dest) {
            this.logger.debug('ContactService: destination.host preview', {
    type: typeof dest.host,
    destHost: dest.host,
  });

  this.logger.debug('ContactService: fetched destination for enrichment', {
    idOrSlug: dto.hostId,
    found: true,
  });
          objectTitle = objectTitle || dest.title;
          hostLink = `${process.env.SITE_URL ?? ''}/destinations/${dest.slug ?? dest.title}`;
          this.logger.debug('ContactService: destination.host preview', {
            type: typeof dest.host,
            preview: String(dest.host).slice(0, 300),
          });

          const parsed = this.parseHostField(dest.host);
          if (parsed.email) hostEmail = parsed.email.toLowerCase();
          if (parsed.phone) hostPhone = parsed.phone;
          if (!dto.hostName && parsed.name) objectTitle = parsed.name;
        }
      }
    } catch (err) {
      this.logger.warn('Failed to lookup host for email enrichment', err as any);
    }
if (!hostEmail && typeof dto.hostEmail === 'string' && dto.hostEmail.trim() !== '') {
  hostEmail = String(dto.hostEmail).trim().toLowerCase();
  this.logger.debug('ContactService: using hostEmail from DTO', { hostEmail });
}
    // Build admin email body
    const adminBody = `
      <p>New contact message from site:</p>
      <table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:8px;">
        <tr><td style="font-weight:600;width:120px;">Host</td><td>${this.escape(objectTitle || 'N/A')} (${this.escape(dto.hostType ?? 'n/a')})</td></tr>
        <tr><td style="font-weight:600;">Host link</td><td>${this.escape(hostLink || '')}</td></tr>
        <tr><td style="font-weight:600;">Name</td><td>${this.escape(dto.name ?? '')}</td></tr>
        <tr><td style="font-weight:600;">Email</td><td>${this.escape(dto.email ?? '')}</td></tr>
        <tr><td style="font-weight:600;">Phone</td><td>${this.escape(dto.phone ?? '')}</td></tr>
        <tr><td style="font-weight:600;">Message</td><td>${this.escape(message)}</td></tr>
        <tr><td style="font-weight:600;">Received</td><td>${new Date(record.createdAt).toISOString()}</td></tr>
      </table>
      <p style="color:#6b7280;font-size:13px;margin-top:8px;">IP hash: ${this.escape(ipHash ?? '')}</p>
    `;

    const adminHtml = this.mailer.buildLayout({
      title: `Host contact — ${objectTitle || 'Contact'}`,
      preheader: `New message for ${objectTitle || 'host'}`,
      bodyHtml: adminBody,
      footerNote: 'Contact notification',
    });





let adminSent = false;
let hostSent = false;
let hostEmailFound: string | null = hostEmail ?? null;

// send admin notification
const adminTo = process.env.ADMIN_EMAIL || (this.mailer as any).ADMIN_EMAIL || process.env.EMAIL_USER;
try {
  await this.mailer.sendMail({
    from: (this.mailer as any)._from ? (this.mailer as any)._from() : `"${process.env.SITE_TITLE ?? 'Site'}" <${process.env.EMAIL_USER}>`,
    to: adminTo,
    subject: `New host contact — ${objectTitle || 'Contact'}`,
    html: adminHtml,
  });
  adminSent = true;
  this.logger.log(`Admin notification sent to ${adminTo}`);
} catch (err) {
  adminSent = false;
  this.logger.error('Failed to send admin contact email', err as any);
}

if (hostEmail) {
  this.logger.debug(`Host email found: ${hostEmail} (hostName=${dto.hostName ?? objectTitle})`);
  hostEmail = hostEmail ? String(hostEmail).trim() : null;
  hostEmailFound = hostEmail;
  if (!this.isEmailLike(hostEmail)) {
    this.logger.warn('Host email looks invalid, skipping host notification', { hostEmail, hostName: dto.hostName ?? objectTitle });
  } else {
    try {
      const hostBody = `
        <p>Hi ${this.escape(dto.hostName ?? objectTitle ?? 'Host')},</p>
        <p>You have a new message from a guest on ${this.escape(process.env.SITE_TITLE ?? 'site')}:</p>
        <table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:8px;">
          <tr><td style="font-weight:600;width:120px;">Name</td><td>${this.escape(dto.name ?? '')}</td></tr>
          <tr><td style="font-weight:600;">Email</td><td>${this.escape(dto.email ?? '')}</td></tr>
          <tr><td style="font-weight:600;">Phone</td><td>${this.escape(dto.phone ?? '')}</td></tr>
          <tr><td style="font-weight:600;">Message</td><td>${this.escape(message)}</td></tr>
          ${hostLink ? `<tr><td style="font-weight:600;">Link</td><td>${this.escape(hostLink)}</td></tr>` : ''}
        </table>
      `;

      const hostHtml = this.mailer.buildLayout({
        title: `New guest message — ${objectTitle || 'Host'}`,
        preheader: `Message from guest on ${process.env.SITE_TITLE ?? 'site'}`,
        bodyHtml: hostBody,
        footerNote: 'Guest message',
      });

      await this.mailer.sendMail({
        from: (this.mailer as any)._from ? (this.mailer as any)._from() : `"${process.env.SITE_TITLE ?? 'Site'}" <${process.env.EMAIL_USER}>`,
        to: hostEmail,
        subject: `New guest message — ${objectTitle || 'Host'}`,
        html: hostHtml,
      });

      hostSent = true;
      this.logger.log(`Host notification sent to ${hostEmail}`);
    } catch (err) {
      hostSent = false;
      this.logger.warn('Failed to send host notification email', err as any);
    }
  }
} else {
  this.logger.debug('No hostEmail found — host notification skipped');
  hostSent = false;
}


// finally return record + send status so callers can inspect
return { record, adminSent, hostSent, hostEmail: hostEmailFound };

  }

  /**
   * Admin: list contact requests
   * - options.limit: max number of rows (default 200)
   * - options.resolved: true/false/undefined
   */
  async listContactRequests(options?: { limit?: number; resolved?: boolean; reason?: string; excludeReason?: string }) {
    const take = Math.min(options?.limit ?? 200, 1000);
    const where: any = {};

    if (typeof options?.resolved === 'boolean') where.resolved = options.resolved;

    if (options?.reason && String(options.reason).trim() !== '') {
      where.reason = String(options.reason).trim();
    }

    if (options?.excludeReason && String(options.excludeReason).trim() !== '') {
      const ex = String(options.excludeReason).trim();
      // If reason is already explicitly requested, prefer that exact match.
      // Otherwise add a NOT condition to exclude rows with matching reason.
      if (!where.reason) {
        where.NOT = { reason: ex };
      } else {
        this.logger.debug('both reason and excludeReason provided; ignoring excludeReason', { reason: where.reason, excludeReason: ex });
      }
    }

    this.logger.debug('Admin: listing contact requests', { limit: take, resolved: options?.resolved, reason: options?.reason, excludeReason: options?.excludeReason });

    const rows = await this.prisma.contactRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
    });
    return rows;
  }


  async getContactRequest(id: string) {
    this.logger.debug('Admin: fetching contact request', { id });
    return await this.prisma.contactRequest.findUnique({ where: { id } });
  }

  async deleteContactRequest(id: string) {
    this.logger.debug('Admin: deleting contact request', { id });
    return await this.prisma.contactRequest.delete({ where: { id } });
  }

  async markContactResolved(id: string) {
    this.logger.debug('Admin: marking resolved', { id });
    return await this.prisma.contactRequest.update({
      where: { id },
      data: { resolved: true },
    });
  }
  // src/modules/contact/contact.service.ts
// ... inside ContactService class (append) ...

  // Admin helpers
  async markContactViewed(id: string) {
    this.logger.debug('Admin: marking viewed', { id });
    return await this.prisma.contactRequest.update({
      where: { id },
      data: { viewed: true, viewedAt: new Date() },
    });
  }

  async replyToContact(id: string, subject: string, bodyHtmlOrText: string) {
    // fetch the contact (must have email)
    const rec = await this.prisma.contactRequest.findUnique({ where: { id } });
    if (!rec) throw new Error('Contact not found');
    if (!rec.email) throw new Error('Contact has no email');

    // build a simple email layout — reuse mailer.buildLayout if available
    const html = this.mailer.buildLayout
      ? this.mailer.buildLayout({
          title: subject,
          preheader: `Reply regarding your message on ${process.env.SITE_TITLE ?? 'site'}`,
          bodyHtml: `<div>${this.escape(bodyHtmlOrText).replace(/\n/g, "<br/>")}</div>`,
          footerNote: 'Reply from site admin',
        })
      : bodyHtmlOrText;

    const from = (this.mailer as any)._from ? (this.mailer as any)._from() : `"${process.env.SITE_TITLE ?? 'Site'}" <${process.env.EMAIL_USER}>`;

    await this.mailer.sendMail({
      to: rec.email,
      from,
      subject,
      html,
    });

    // record in DB: optional — store lastRepliedAt
    try {
      await this.prisma.contactRequest.update({
        where: { id },
        data: { lastRepliedAt: new Date() },
      });
    } catch (e) {
      this.logger.debug('Failed to update lastRepliedAt', e as any);
    }

    return { ok: true };
  }


}
