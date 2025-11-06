import { Injectable, Logger } from '@nestjs/common';

import { MailerService } from '../mailer/mailer.service';
import { CreateBookingEnquiryDto } from './dto/create-booking-enquiry.dto';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class BookingInquiryService {
  private readonly logger = new Logger(BookingInquiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {}
private escape(input: any): string {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

  private isEmailLike(e?: string) {
    if (!e) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e).trim());
  }
private formatDateForEmail(input?: string | Date | null) {
  if (!input) return "—";
  const d = input instanceof Date ? input : new Date(String(input));
  if (Number.isNaN(d.getTime())) return this.escape(String(input));
  // e.g. "Nov 5, 2025" or "Nov 5, 2025 14:30" if there's a time part
  const datePart = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const timePart = d.getHours() || d.getMinutes() ? ` ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : "";
  return `${datePart}${timePart}`;
}

private formatGuestsForEmail(g?: any) {
  if (!g) return "—";
  // g can be: { adults, children, infants, rooms } or a plain number
  if (typeof g === "number") return `${g} guest${g !== 1 ? "s" : ""}`;
  try {
    const adults = Number(g.adults ?? 0);
    const children = Number(g.children ?? 0);
    const infants = Number(g.infants ?? 0);
    const rooms = Number(g.rooms ?? 0);
    const parts: string[] = [];
    if (adults) parts.push(`${adults} adult${adults !== 1 ? "s" : ""}`);
    if (children) parts.push(`${children} child${children !== 1 ? "ren" : ""}`);
    if (infants) parts.push(`${infants} infant${infants !== 1 ? "s" : ""}`);
    if (rooms) parts.push(`${rooms} room${rooms !== 1 ? "s" : ""}`);
    return parts.length ? parts.join(" · ") : "—";
  } catch {
    return this.escape(String(g));
  }
}

private formatPriceForEmail(amount?: number | string | null, currency?: string | null) {
  if (amount == null || amount === "") return "—";
  try {
    const n = typeof amount === "string" ? Number(amount) : Number(amount ?? NaN);
    if (Number.isNaN(n)) return `${currency ?? ""} ${String(amount)}`;
    const c = currency ?? "USD";
    return `${c} ${n.toLocaleString("en-US")}`;
  } catch {
    return `${currency ?? ""} ${String(amount)}`;
  }
}

  /**
   * Create a BookingEnquiry record, enrich it (resolve host email if possible),
   * and send admin + host emails.
   */
  async createBookingEnquiry(dto: CreateBookingEnquiryDto) {
    // --- 1) attempt to resolve host information from passed ids ---
    let resolvedHostEmail: string | null = null;
    let resolvedHostId: string | null = null;
    let resolvedHostName: string | null = null;
    let resolvedDestinationTitle: string | null = null;
    let resolvedExperienceTitle: string | null = null;
    let resolvedDurationTitle: string | null = dto.durationTitle ?? null;

    // If explicit hostId provided, load host
    if (dto.hostId) {
      const host = await this.prisma.host.findUnique({ where: { id: dto.hostId } });
      if (host) {
        resolvedHostEmail = host.email || null;
        resolvedHostId = host.id;
        resolvedHostName = host.name;
      }
    }

    // If destinationId given, try to get destination -> host
    if (!resolvedHostEmail && dto.destinationId) {
      const destination = await this.prisma.destination.findUnique({
        where: { id: dto.destinationId },
        include: { host: true },
      });
      if (destination) {
        resolvedDestinationTitle = destination.title ?? null;
        if (destination.host) {
          resolvedHostEmail = destination.host.email ?? null;
          resolvedHostId = destination.host.id;
          resolvedHostName = destination.host.name;
        }
      }
    }

    // If experienceId given, try to get experience -> host
    if (!resolvedHostEmail && dto.experienceId) {
      const experience = await this.prisma.experience.findUnique({
        where: { id: dto.experienceId },
        include: { host: true },
      });
      if (experience) {
        resolvedExperienceTitle = experience.title ?? null;
        if (experience.host) {
          resolvedHostEmail = experience.host.email ?? null;
          resolvedHostId = experience.host.id;
          resolvedHostName = experience.host.name;
        }
      }
    }

    // If durationOptionId given, try to get durationOption -> destination/experience -> host
    if (!resolvedHostEmail && dto.durationOptionId) {
      const dur = await this.prisma.durationOption.findUnique({
        where: { id: dto.durationOptionId },
        include: {
          destination: { include: { host: true } },
          experience: { include: { host: true } },
        },
      });
      if (dur) {
        if (!resolvedDurationTitle) resolvedDurationTitle = dur.title ?? null;
        if (dur.destination) {
          resolvedDestinationTitle = resolvedDestinationTitle ?? dur.destination.title ?? null;
          if (dur.destination.host) {
            resolvedHostEmail = resolvedHostEmail ?? dur.destination.host.email ?? null;
            resolvedHostId = resolvedHostId ?? dur.destination.host.id ?? null;
            resolvedHostName = resolvedHostName ?? dur.destination.host.name ?? null;
          }
        }
        if (dur.experience) {
          resolvedExperienceTitle = resolvedExperienceTitle ?? dur.experience.title ?? null;
          if (dur.experience.host) {
            resolvedHostEmail = resolvedHostEmail ?? dur.experience.host.email ?? null;
            resolvedHostId = resolvedHostId ?? dur.experience.host.id ?? null;
            resolvedHostName = resolvedHostName ?? dur.experience.host.name ?? null;
          }
        }
      }
    }

    // If the user included a "hostEmail" in meta or DTO (rare) use it
    if (!resolvedHostEmail && (dto.meta?.hostEmail || (dto as any).hostEmail)) {
      const candidate = dto.meta?.hostEmail ?? (dto as any).hostEmail;
      if (this.isEmailLike(candidate)) resolvedHostEmail = candidate;
    }
    let durationOptionRecord: any = null;
if (dto.durationOptionId) {
  try {
    durationOptionRecord = await this.prisma.durationOption.findUnique({
      where: { id: dto.durationOptionId },
      include: {
        destination: true,
        experience: true,
      },
    });
    // prefer DB title if available
    if (durationOptionRecord?.title && !resolvedDurationTitle) {
      resolvedDurationTitle = durationOptionRecord.title;
    }
    // prefer destination/experience titles if not set
    if (durationOptionRecord?.destination && !resolvedDestinationTitle) {
      resolvedDestinationTitle = durationOptionRecord.destination.title ?? resolvedDestinationTitle;
    }
    if (durationOptionRecord?.experience && !resolvedExperienceTitle) {
      resolvedExperienceTitle = durationOptionRecord.experience.title ?? resolvedExperienceTitle;
    }
  } catch (err) {
    this.logger.warn('Failed to load duration option for email', err as any);
  }
}

const durationOptionText = (() => {
  if (!durationOptionRecord && !resolvedDurationTitle) return '—';
  const title = durationOptionRecord?.title ?? resolvedDurationTitle ?? dto.durationTitle ?? '—';
  const days = durationOptionRecord?.days ?? (dto.nights ? Number(dto.nights) : null);
  const durationLabel = durationOptionRecord?.durationLabel ?? (days ? `${days} day${days !== 1 ? 's' : ''}` : null);
  const priceFrom =
    typeof durationOptionRecord?.priceFrom !== 'undefined'
      ? this.formatPriceForEmail(durationOptionRecord.priceFrom, durationOptionRecord.currency ?? dto.currency)
      : null;
  const parts = [this.escape(title)];
  if (durationLabel) parts.push(this.escape(durationLabel));
  if (priceFrom) parts.push(priceFrom);

  // NO admin "view" link here — we intentionally return only the textual parts
  return parts.join(' · ');
})();


    // --- 2) create DB record with relation ids resolved above ---
// --- 2) create DB record with relation ids resolved above ---
const createData: any = {
  hostId: resolvedHostId ?? null,
  destinationId: dto.destinationId ?? null,
  experienceId: dto.experienceId ?? null,
  durationOptionId: dto.durationOptionId ?? null,

  // <-- ensure these resolved titles are persisted:
  destinationTitle: resolvedDestinationTitle ?? dto.destinationTitle ?? null,
  experienceTitle: resolvedExperienceTitle ?? dto.experienceTitle ?? null,
  durationTitle: resolvedDurationTitle ?? dto.durationTitle ?? null,

  startDate: dto.startDate ? new Date(dto.startDate) : null,
  endDate: dto.endDate ? new Date(dto.endDate) : null,
  nights: dto.nights ?? null,
  guests: dto.guests ? dto.guests : null,
  rooms: dto.rooms ?? null,
  message: dto.message ?? '',
  name: dto.name ?? null,
  email: dto.email ?? null,
  phone: dto.phone ?? null,
  currency: dto.currency ?? null,
  priceEstimate: dto.priceEstimate ?? null,
  meta: dto.meta ?? null,
  hostEmailUsed: resolvedHostEmail ?? null,
};

    const record = await this.prisma.bookingEnquiry.create({ data: createData });
    this.logger.log(`BookingEnquiry saved ${record.id}`);

const renderRow = (label: string, value?: string | null) => {
  const s = String(value ?? "").trim();
  if (!s) return ""; // don't render empty rows
  return `<tr>
    <td style="font-weight:600;vertical-align:top">${this.escape(label)}</td>
    <td style="vertical-align:top">${this.escape(s)}</td>
  </tr>`;
};
    // --- 3) send admin email ---
const adminBody = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <h2 style="margin:0 0 8px 0;font-size:18px;">New booking enquiry</h2>
    <p style="margin:0 0 18px 0;color:#475569;font-size:13px;">A guest submitted a booking enquiry. Details below.</p>

    <table role="presentation" cellspacing="0" cellpadding="8" style="width:100%;max-width:640px;border-collapse:collapse;">
      <tr>
        <td style="font-weight:600;width:160px;vertical-align:top">Guest</td>
        <td style="vertical-align:top">${this.escape(dto.name ?? "—")} &lt;${this.escape(dto.email ?? "—")}&gt;</td>
      </tr>

      <tr>
        <td style="font-weight:600;vertical-align:top">Phone</td>
        <td style="vertical-align:top">${this.escape(dto.phone ?? "—")}</td>
      </tr>

      ${renderRow("Destination", resolvedDestinationTitle)}
      ${renderRow("Experience", resolvedExperienceTitle)}

      <tr>
        <td style="font-weight:600;vertical-align:top">Duration</td>
        <td style="vertical-align:top">${this.escape(resolvedDurationTitle ?? dto.durationTitle ?? "—")}</td>
      </tr>

      <tr>
        <td style="font-weight:600;vertical-align:top">Dates</td>
        <td style="vertical-align:top">${this.formatDateForEmail(dto.startDate)} → ${this.formatDateForEmail(dto.endDate)}</td>
      </tr>

      <tr>
        <td style="font-weight:600;vertical-align:top">Nights</td>
        <td style="vertical-align:top">${dto.nights ?? "—"}</td>
      </tr>

      <tr>
        <td style="font-weight:600;vertical-align:top">Guests</td>
        <td style="vertical-align:top">${this.formatGuestsForEmail(dto.guests)}</td>
      </tr>

      <tr>
        <td style="font-weight:600;vertical-align:top">Rooms</td>
        <td style="vertical-align:top">${dto.rooms ?? "—"}</td>
      </tr>

      <tr>
        <td style="font-weight:600;vertical-align:top">Price</td>
        <td style="vertical-align:top">${this.formatPriceForEmail(dto.priceEstimate ?? dto.totalPrice, dto.currency)}</td>
      </tr>


      <tr>
        <td style="font-weight:600;vertical-align:top">Host</td>
        <td style="vertical-align:top">${this.escape(resolvedHostName ?? "")} ${this.escape(resolvedHostEmail ?? "")}</td>
      </tr>

      <tr>
        <td style="font-weight:600;vertical-align:top">Message</td>
        <td style="vertical-align:top;white-space:pre-wrap">${this.escape(dto.message ?? "")}</td>
      </tr>

      <tr>
  <td style="font-weight:600;vertical-align:top">Package option</td>
  <td style="vertical-align:top">${durationOptionText}</td>
</tr>

    </table>


  </div>
`;

    const adminHtml = this.mailer.buildLayout({
      title: `Booking enquiry: ${resolvedDestinationTitle ?? 'Enquiry'}`,
      preheader: `New booking enquiry`,
      bodyHtml: adminBody,
      footerNote: 'Booking enquiry notification',
    });

    let adminSent = false;
      let adminError: string | null = null;
   try {
    await this.mailer.sendMail({
      from: (this.mailer as any)._from ? (this.mailer as any)._from() : `"${process.env.SITE_TITLE || 'Site'}" <${process.env.EMAIL_USER}>`,
      to: process.env.ADMIN_EMAIL || (this.mailer as any).ADMIN_EMAIL || 'admin@example.com',
      subject: `New booking enquiry: ${resolvedDestinationTitle ?? 'Enquiry'}`,
      html: adminHtml,
    });
    adminSent = true;
    await this.prisma.bookingEnquiry.update({ where: { id: record.id }, data: { adminNotified: true } });
    this.logger.log('Admin email sent');
  } catch (err: any) {
    adminError = err?.message ?? String(err);
    this.logger.warn('Failed to send admin email', err);
  }


    // --- 4) send host email (if resolved) ---
  let hostSent = false;
  let hostError: string | null = null;

  if (resolvedHostEmail && this.isEmailLike(resolvedHostEmail)) {
    try {
const hostBody = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <p style="margin:0 0 12px 0;">Hi ${this.escape(resolvedHostName ?? "Host")},</p>
    <p style="margin:0 0 16px 0;color:#475569;font-size:13px;">You have a new booking enquiry. Guest details and requested dates are below.</p>

    <table role="presentation" cellspacing="0" cellpadding="8" style="width:100%;max-width:640px;border-collapse:collapse;">
      <tr>
        <td style="font-weight:600;width:140px;vertical-align:top">Name</td>
        <td style="vertical-align:top">${this.escape(dto.name ?? "—")}</td>
      </tr>
      <tr>
        <td style="font-weight:600;vertical-align:top">Email</td>
        <td style="vertical-align:top">${this.escape(dto.email ?? "—")}</td>
      </tr>
      <tr>
        <td style="font-weight:600;vertical-align:top">Phone</td>
        <td style="vertical-align:top">${this.escape(dto.phone ?? "—")}</td>
      </tr>
          ${renderRow("Destination", resolvedDestinationTitle)}
      ${renderRow("Experience", resolvedExperienceTitle)}
      <tr>
        <td style="font-weight:600;vertical-align:top">Dates</td>
        <td style="vertical-align:top">${this.formatDateForEmail(dto.startDate)} → ${this.formatDateForEmail(dto.endDate)}</td>
      </tr>
      <tr>
        <td style="font-weight:600;vertical-align:top">Nights</td>
        <td style="vertical-align:top">${dto.nights ?? "—"}</td>
      </tr>
      <tr>
        <td style="font-weight:600;vertical-align:top">Guests</td>
        <td style="vertical-align:top">${this.formatGuestsForEmail(dto.guests)}</td>
      </tr>
      <tr>
        <td style="font-weight:600;vertical-align:top">Rooms</td>
        <td style="vertical-align:top">${dto.rooms ?? "—"}</td>
      </tr>
      <tr>
        <td style="font-weight:600;vertical-align:top">Estimated price</td>
        <td style="vertical-align:top">${this.formatPriceForEmail(dto.priceEstimate ?? dto.totalPrice, dto.currency)}</td>
      </tr>
      <tr>
        <td style="font-weight:600;vertical-align:top">Message</td>
        <td style="vertical-align:top;white-space:pre-wrap">${this.escape(dto.message ?? "")}</td>
      </tr>
      <tr>
  <td style="font-weight:600;vertical-align:top">Package option</td>
  <td style="vertical-align:top">${durationOptionText}</td>
</tr>

    </table>



    <div style="margin-top:18px">
      <a href="mailto:${this.escape(dto.email ?? '')}?subject=${encodeURIComponent(`Re: booking enquiry: ${resolvedDestinationTitle ?? 'Enquiry'}`)}" style="display:inline-block;padding:10px 14px;background:#9B0302;color:#fff;border-radius:50px;text-decoration:none">Reply to guest</a>
    </div>
  </div>
`;

        const hostHtml = this.mailer.buildLayout({
          title: `Booking enquiry: ${resolvedDestinationTitle ?? 'Enquiry'}`,
          preheader: `Booking enquiry for ${resolvedDestinationTitle ?? 'your listing'}`,
          bodyHtml: hostBody,
          footerNote: 'Guest enquiry',
        });

       await this.mailer.sendMail({
        from: (this.mailer as any)._from ? (this.mailer as any)._from() : `"${process.env.SITE_TITLE || 'Site'}" <${process.env.EMAIL_USER}>`,
        to: resolvedHostEmail,
        subject: `New booking enquiry from ${dto.name ?? 'Guest'}`,
        html: hostHtml,
      });

    hostSent = true;
      await this.prisma.bookingEnquiry.update({ where: { id: record.id }, data: { hostNotified: true, hostEmailUsed: resolvedHostEmail } });
      this.logger.log(`Host email sent to ${resolvedHostEmail}`);
    } catch (err: any) {
      hostError = err?.message ?? String(err);
      this.logger.warn('Failed to send host email', err);
    }
    }

    return {
      record,
      adminSent,
      hostSent,
      hostEmail: resolvedHostEmail,
         adminError,
    hostError,
    };
  }
  async listBookingEnquiries(options?: { limit?: number; unnotified?: boolean }) {
    const take = Math.min(options?.limit ?? 200, 1000);
    const where: any = {};

    if (typeof options?.unnotified === 'boolean') {
      if (options.unnotified) {
        // only those not yet admin-notified
        where.adminNotified = false;
      }
      // if unnotified === false -> no filter (return all)
    }

    this.logger.debug('Admin: listing booking enquiries', { limit: take, unnotified: options?.unnotified });

    const rows = await this.prisma.bookingEnquiry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
    });

    return rows;
  }

  async getBookingEnquiry(id: string) {
    this.logger.debug('Admin: fetching booking enquiry', { id });
    return await this.prisma.bookingEnquiry.findUnique({ where: { id } });
  }

  async markAdminNotified(id: string) {
    this.logger.debug('Admin: mark booking adminNotified', { id });
    return await this.prisma.bookingEnquiry.update({
      where: { id },
      data: { adminNotified: true },
    });
  }

  async markHostNotified(id: string) {
    this.logger.debug('Admin: mark booking hostNotified', { id });
    return await this.prisma.bookingEnquiry.update({
      where: { id },
      data: { hostNotified: true },
    });
  }
    /**
   * Return booking enquiries created within the last `days` days.
   * Defaults to last 7 days. Optional limit (capped at 1000).
   */
  async listLatestBookingEnquiries(options?: { limit?: number; days?: number; unnotified?: boolean }) {
    const days = typeof options?.days === 'number' && options.days > 0 ? options.days : 7;
    const take = Math.min(options?.limit ?? 200, 1000);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const where: any = {
      createdAt: { gte: since },
    };

    if (typeof options?.unnotified === 'boolean' && options?.unnotified) {
      where.adminNotified = false;
    }

    this.logger.debug('Admin: listing latest booking enquiries', { days, limit: take, unnotified: options?.unnotified });

    const rows = await this.prisma.bookingEnquiry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
    });

    return rows;
  }
}
