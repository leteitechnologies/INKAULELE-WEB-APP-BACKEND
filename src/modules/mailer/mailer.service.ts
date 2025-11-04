// src/mailer/mailer.service.ts
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { SentMessageInfo } from 'nodemailer';

export interface ChangeDetail { field: string; from: string; to: string; at: Date; }
type CTA = { label: string; url: string };
type Social = { label: string; url: string; icon: string };

@Injectable()
export class MailerService {
  private readonly transporter: nodemailer.Transporter;
  private readonly logger = new Logger(MailerService.name);

  // brand tokens
  private readonly BRAND = {
    button: '#9B0302', // keep brand red
    bg: '#FAF6F1',
    cta: '#0b0b0c',
    text: '#0b0b0c',
    subtle: '#6b7280',
    card: '#ffffff',
    border: '#e5e7eb',
  };

  // Pull site metadata from config
  private readonly SITE_TITLE: string;
  private readonly SITE_DESCRIPTION: string;
  private readonly SITE_ICON: string;
  private readonly ADMIN_EMAIL: string;
private readonly VOUCHER_EMAILS_ENABLED: boolean;
  constructor(private readonly config: ConfigService) {
    this.SITE_TITLE = this.config.get('SITE_TITLE', 'inkaulele sidan');
    this.SITE_DESCRIPTION = this.config.get('SITE_DESCRIPTION', 'Luxury safaris & cultural tours in Kenya');
    this.SITE_ICON = this.config.get('SITE_ICON', 'https://res.cloudinary.com/dahrcnjfh/image/upload/v1759849979/inkaulele-transparent-logo.png');
    this.ADMIN_EMAIL = this.config.get('ADMIN_EMAIL', this.config.get('EMAIL_USER') || '');
  this.VOUCHER_EMAILS_ENABLED = String(this.config.get('VOUCHER_EMAILS_ENABLED', 'false')).toLowerCase() === 'true';
    this.transporter = nodemailer.createTransport({
      host: this.config.get('EMAIL_HOST', 'smtp.gmail.com'),
      port: Number(this.config.get('EMAIL_PORT', 465)),
      secure: true,
      auth: {
        user: this.config.get<string>('EMAIL_USER'),
        pass: this.config.get<string>('EMAIL_PASS'),
      },
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      connectionTimeout: 30_000,
      greetingTimeout: 30_000,
      socketTimeout: 60_000,
      logger: true,
      debug: true,
    });

    this.transporter.verify((err) => {
      if (err) this.logger.error('❌ SMTP connection failed:', err);
      else this.logger.log('✅ SMTP connection successful');
    });
  }

  async sendMail(options: nodemailer.SendMailOptions): Promise<SentMessageInfo> {
    try {
      const info = await this.transporter.sendMail(options);
      this.logger.log(`📧 Email sent to ${options.to}, messageId=${info.messageId}`);
      return info;
    } catch (err) {
      this.logger.error('❌ Failed to send email', err);
      throw new InternalServerErrorException('Failed to send email');
    }
  }

  /**
   * Build HTML email layout.
   * @param socials optional array of social links {label, url, icon}
   */
  buildLayout({
    title,
    preheader,
    bodyHtml,
    cta,
     footerHtml,
    footerNote,
    socials,
  }: {
    title: string;
    preheader?: string;
    bodyHtml: string;
    cta?: CTA;
    footerHtml?: string;
    footerNote?: string;
    socials?: Social[];
  }): string {
    const { bg, card, text, subtle, button, border } = this.BRAND;

    const buttonHtml = cta
      ? `
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0 4px 0;">
        <tr>
          <td align="center" bgcolor="${button}" style="border-radius:9999px;">
            <a href="${this.escape(cta.url)}"
               style="display:inline-block;padding:12px 20px;font-weight:600;text-decoration:none;border-radius:9999px;background:${button};color:#fff;"
               target="_blank" rel="noopener">
              ${this.escape(cta.label)}
            </a>
          </td>
        </tr>
      </table>
    `
      : '';

    const preheaderSpan = preheader
      ? `<span style="display:none !important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">
           ${this.escape(preheader)}
         </span>`
      : '';

    // logo block (centered)
    const logoHtml = this.SITE_ICON
      ? `<div style="text-align:center;margin-bottom:12px;">
           <img src="${this.escape(this.SITE_ICON)}" alt="${this.escape(this.SITE_TITLE)} logo" width="96" height="96" style="display:block;margin:0 auto;max-width:120px;height:auto;" />
         </div>`
      : '';

    // Social icons block (if provided)
    const socialsHtml = socials && socials.length
      ? `
      <div style="text-align:center;margin-top:18px;">
        <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${subtle};font-size:12px;margin-bottom:8px;">
          Follow us on;
        </div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
          <tr>
            <td style="padding:6px 0;">
              ${socials.map(s => `
                <a href="${this.escape(s.url)}" target="_blank" rel="noopener" title="${this.escape(s.label)}" style="display:inline-block;text-decoration:none;margin:0 6px;">
                  <img src="${this.escape(s.icon)}" alt="${this.escape(s.label)}" width="36" height="36" style="display:block;border-radius:50%;border:1px solid ${border};background:${card};padding:4px;max-width:36px;height:auto;" />
                </a>
              `).join('')}
            </td>
          </tr>
        </table>
        
      </div>
      `
      : '';

 return `
    <!doctype html>
    <html lang="en" xmlns="http://www.w3.org/1999/xhtml">
    <head>
      <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>${this.escape(title)}</title>
    </head>
    <body style="margin:0;padding:0;background:${bg};">
      ${preheaderSpan}
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:${bg};">
        <tr>
          <td align="center" style="padding:24px;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;">
              <tr>
                <td style="background:${card};border:1px solid ${border};border-radius:16px;padding:32px;">
                  ${logoHtml}
                  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:20px;line-height:28px;font-weight:700;color:${text};margin-bottom:8px;">
                    ${this.escape(title)}
                  </div>
                  <div style="color:${subtle};font-size:13px;margin-bottom:12px;">${this.escape(this.SITE_DESCRIPTION)}</div>

                  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
                              color:${text};font-size:14px;line-height:22px;margin-top:12px;">
                    ${bodyHtml}
                    ${buttonHtml}
                  </div>

                  ${socialsHtml}
                </td>
              </tr>

              <tr>
                <td align="center" style="padding:16px 8px 0 8px;">
                  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
                              color:${subtle};font-size:12px;line-height:18px;">
                    ${footerHtml ? footerHtml : (footerNote ? this.escape(footerNote) : 'You’re receiving this because you subscribed to our newsletter.')}
                  </div>
                </td>
              </tr>
              <tr>
                <td style="height:24px;"></td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    `;
  }

  // sends admin notification + confirmation email to subscriber
  async sendSubscriptionEmails(email: string): Promise<void> {
    // Admin notification
    const adminBody = `
      <p style="margin:0 0 8px 0;">New newsletter subscription:</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:12px 0;">
        <tr><td style="font-weight:600;width:120px;">Email</td><td><a href="mailto:${this.escape(email)}">${this.escape(email)}</a></td></tr>
        <tr><td style="font-weight:600;width:120px;">Subscribed</td><td>${new Date().toISOString()}</td></tr>
      </table>
    `;

    const adminHtml = this.buildLayout({
      title: `New subscriber — ${this.SITE_TITLE}`,
      preheader: `New subscriber: ${email}`,
      bodyHtml: adminBody,
      footerNote: 'Automated subscription notification.',
      // admin notifications don't need the socials block
    });

    await this.sendMail({
      from: `"${this.SITE_TITLE}" <${this.config.get('EMAIL_USER')}>`,
      to: this.ADMIN_EMAIL,
      subject: `New newsletter subscriber: ${email}`,
      html: adminHtml,
    });

    // Build socials list from env vars (fallback icons provided)
    const socials: Social[] = [
      {
        label: 'TikTok',
        url: this.config.get('SOCIAL_TIKTOK', 'https://www.tiktok.com/'),
        icon: this.config.get('SOCIAL_TIKTOK_ICON', 'https://img.icons8.com/3d-fluency/94/tiktok-logo.png'),
      },
      {
        label: 'Instagram',
        url: this.config.get('SOCIAL_INSTAGRAM', 'https://www.instagram.com/'),
        icon: this.config.get('SOCIAL_INSTAGRAM_ICON', 'https://img.icons8.com/3d-fluency/94/instagram-logo.png'),
      },
      {
        label: 'YouTube',
        url: this.config.get('SOCIAL_YOUTUBE', 'https://www.youtube.com/'),
        icon: this.config.get('SOCIAL_YOUTUBE_ICON', 'https://img.icons8.com/3d-fluency/94/youtube-logo.png'),
      },
    ].filter(s => !!s.url); // keep only configured ones

    // Subscriber confirmation
    const subscriberBody = `
      <p style="margin:0 0 8px 0;">Hi, thanks for subscribing to ${this.escape(this.SITE_TITLE)}!</p>
      <p style="margin:0 0 8px 0;">
        We’re excited to have you on board. Expect occasional updates filled with travel tips, hidden gems, and exclusive offers from Kenya.
      </p>
    `;

    const confirmHtml = this.buildLayout({
      title: `Welcome to ${this.SITE_TITLE}`,
      preheader: `Thanks for subscribing to ${this.SITE_TITLE}`,
      bodyHtml: subscriberBody,
      // cta: { label: 'Visit the site', url: this.config.get('SITE_URL', 'https://your-site.example.com') },
      footerNote: 'If you didn’t sign up, you can ignore this email.',
      socials, // include the modern social icons block
    });

    await this.sendMail({
      from: `"${this.SITE_TITLE}" <${this.config.get('EMAIL_USER')}>`,
      to: email,
      subject: `Welcome to ${this.SITE_TITLE}`,
      html: confirmHtml,
    });
  }



  // small helper to compute a safe "from" address
  private _from(): string {
    const user = this.config.get('EMAIL_USER');
    const from = user && String(user).length ? user : this.ADMIN_EMAIL;
    return `"${this.SITE_TITLE}" <${from}>`;
  }

  // allow any input (coerce) so callers with undefined don't crash
  private escape(input: any): string {
    return String(input ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  /**
   * Return escaped First name from a full name string.
   * If input is empty/invalid returns empty string.
   */
  private firstName(fullName: any): string {
    const s = String(fullName ?? '').trim();
    if (!s) return '';
    const first = s.split(/\s+/)[0];
    // Capitalize first letter, keep rest as-is (avoid heavy transforms)
    const normalized = first.charAt(0).toUpperCase() + first.slice(1);
    return this.escape(normalized);
  }
  /**
   * Send booking receipt email with PDF attachment OR download link.
   * Keeps existing API shape but clearer name.
   */
  async sendReceiptEmail(params: {
    to: string;
    travelerName?: string;
    bookingRef: string;
    pdfBuffer?: Buffer;
    filename?: string;
    downloadUrl?: string;
  }) {
    const { to, travelerName, bookingRef, pdfBuffer, filename = `Inkaulele-Receipt-${bookingRef}.pdf`, downloadUrl } = params;


const bodyHtml = `
<p style="margin:0 0 8px 0;">Hi ${this.firstName(travelerName) || 'there'},</p>

<p style="margin:0 0 8px 0;">
Thank you for booking with ${this.escape(this.SITE_TITLE)}! Your payment receipt for booking reference <strong>${this.escape(bookingRef)}</strong> is attached.
</p>

${downloadUrl ? `<p style="margin:8px 0;"><a href="${this.escape(downloadUrl)}" target="_blank" rel="noopener">Download your receipt</a></p>` : ''}

<p style="margin:0 0 8px 0;">Here’s what happens next:</p>
<ul style="margin:0 0 8px 20px; padding:0;">
  <li>Your e-voucher will be sent to your inbox within 72 hours once your booking is fully confirmed.</li>
  <li>Keep your booking reference for easy check-in or pickup.</li>
  <li>If you have any questions or need to make changes, just reply to this email or contact us at 
  <a href="mailto:support@inkaulele.com">support@inkaulele.com</a>.</li>
</ul>

<p style="margin:8px 0 0 0;">We appreciate your trust in us and look forward to helping you travel soon.</p>
`;


    const html = this.buildLayout({
      title: `Your booking receipt from ${this.SITE_TITLE}`,
      preheader: `Receipt ${bookingRef} from ${this.SITE_TITLE}`,
      bodyHtml,
   footerHtml: `If you have trouble opening the attachment, use the "Download your receipt" link above or contact <a href="mailto:support@inkaulele.com" style="color:${this.BRAND.cta};text-decoration:none;">support@inkaulele.com</a>.`,

    });

    const attachments: any[] = [];
    if (pdfBuffer) {
      attachments.push({
        filename,
        content: pdfBuffer,
        contentType: 'application/pdf',
      });
    }

    await this.sendMail({
      from: this._from(),
      to,
      subject: `Your receipt from ${this.SITE_TITLE} (${bookingRef})`,
      html,
      attachments,
    });
  }

  /**
   * Send e-voucher email with optional PDF attachment
   * (This is the merged/cleaned version of your previous sendEvoucherEmail).
   */
 async sendVoucherEmail(params: {
  to: string;
  booking: any;                // full booking object
  voucherUrl?: string;         // short-lived download/view URL
  voucherPdf?: Buffer;         // optional PDF buffer to attach
  filename?: string;           // filename for attachment
  bccAdmin?: boolean;          // whether to bcc the admin email
  force?: boolean;             // whether to force sending the email
}) {
  const { to, booking, voucherUrl, voucherPdf, filename, bccAdmin = true, force = false } = params;

  // Guard: do not send voucher emails unless explicitly enabled or forced.
  if (!this.VOUCHER_EMAILS_ENABLED && !force) {
    this.logger.log(`Voucher emailing is disabled by config (VOUCHER_EMAILS_ENABLED=false). Skipping voucher email for booking ${booking?.reference ?? booking?.id ?? 'N/A'}.`);
    return; // safe no-op
  }

  const ref = booking?.reference ?? booking?.id ?? 'N/A';
  const travelerName = booking?.travelerName ?? '';
  const destTitle = booking?.destination?.title ?? 'Your destination';
  const cover = booking?.destination?.coverImage ?? this.SITE_ICON;
  const fromDate = booking?.fromDate ? new Date(booking.fromDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const toDate = booking?.toDate ? new Date(booking.toDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const nights = booking?.nights ?? 0;
  const guests = (booking?.adults ?? 0) + (booking?.children ?? 0);
  const pickup = booking?.meetingPoint?.name ?? booking?.pickupLocation ?? '';
const payment = booking?.currency
  ? new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: booking.currency,
      minimumFractionDigits: 0,
    }).format(Number(booking.totalPrice ?? 0))
  : `${booking?.totalPrice ?? '—'}`;


  // Quick small itinerary snippet (first 4 items)
  const renderItinerary = (items: any[] = []) => {
    if (!items || !items.length) return `<div style="color:#6b7280;font-size:13px;margin-top:8px;">Full itinerary included in your voucher/PDF.</div>`;
    return `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:8px;">
        ${items.slice(0,4).map(it => `
          <tr>
            <td style="vertical-align:top;padding:6px 0;font-size:14px;color:#111827;width:40px;">
              Day ${this.escape(String(it.day ?? ''))}
            </td>
            <td style="padding:6px 0;font-size:14px;color:#374151;">
              <div style="font-weight:600;">${this.escape(it.title ?? '')}</div>
              <div style="color:#6b7280;font-size:13px;">${this.escape(it.time ?? '')} ${it.durationMinutes ? `• ${it.durationMinutes} mins` : ''}</div>
            </td>
          </tr>
        `).join('')}
      </table>
    `;
  };

  // QR service (fallback to reference if no voucherUrl)
  const qrData = voucherUrl ? voucherUrl : ref;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrData)}`;

  // Build the main card HTML for the voucher email
const bodyHtml = `
  <style>
    /* tiny responsive fallback, won't break clients that ignore media queries */
    @media screen and (max-width:480px){
      .ev-title { display:block !important; }
      .ev-ref { display:block !important; text-align:left !important; margin-top:8px !important; }
    }
  </style>

  <div style="max-width:100%;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0b0b0c;">
    <!-- Hero image -->
    <div style="width:100%;border-radius:12px;overflow:hidden;margin-bottom:14px;">
      <img src="${this.escape(cover)}" alt="${this.escape(destTitle)}" style="display:block;width:100%;height:auto;max-height:220px;object-fit:cover;border-radius:8px;" />
    </div>

    <!-- Booking Card -->
    <div style="background:#ffffff;border-radius:16px;padding:16px;border:1px solid ${this.BRAND.border};box-shadow:0 6px 18px rgba(0,0,0,0.04);">

      <!-- Header as table to reliably pin ref on the right -->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
        <tr>
          <td style="padding:0 12px 8px 0;vertical-align:top;">
            <div class="ev-title" style="font-size:15px;font-weight:700;color:${this.BRAND.text};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
              ${this.escape(destTitle)}
            </div>
            <div style="color:${this.BRAND.subtle};font-size:13px;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
              ${this.escape(booking?.destination?.region ?? booking?.destination?.country ?? '')}
            </div>
          </td>
          <td style="padding:0;vertical-align:top;text-align:right;white-space:nowrap;width:1%;min-width:120px;">
            <div style="font-size:13px;color:${this.BRAND.subtle};">Ref</div>
            <div style="font-family:monospace;font-weight:700;font-size:14px;">
              ${this.escape(ref)}
            </div>
          </td>
        </tr>
      </table>

      <div style="display:flex;gap:12px;margin-top:12px;flex-wrap:wrap;">
        <div style="min-width:140px;background:#f8faf9;padding:10px;border-radius:12px;font-size:13px;">
          <div style="color:#6b7280;font-size:12px;">Dates</div>
          <div style="font-weight:600;margin-top:4px;">${this.escape(fromDate)} — ${this.escape(toDate)}</div>
          <div style="color:#6b7280;font-size:12px;margin-top:6px;">${nights} night${nights!==1 ? 's' : ''}</div>
        </div>

        <div style="min-width:120px;background:#f8faf9;padding:10px;border-radius:8px;font-size:13px;">
          <div style="color:#6b7280;font-size:12px;">Guests</div>
          <div style="font-weight:600;margin-top:4px;">${this.escape(String(guests))}</div>
          <div style="color:#6b7280;font-size:12px;margin-top:6px;">
            Adults: ${this.escape(String(booking?.adults ?? 0))}${booking?.children ? ` • Children: ${this.escape(String(booking.children))}` : ''}
          </div>
        </div>

        <div style="min-width:160px;background:#f8faf9;padding:10px;border-radius:8px;font-size:13px;">
          <div style="color:#6b7280;font-size:12px;">Pickup / Meeting</div>
          <div style="font-weight:600;margin-top:4px;">${this.escape(pickup || 'See voucher')}</div>
        </div>

        <div style="flex:1;min-width:120px;background:transparent;padding:0;">
          <div style="text-align:right;">
            <div style="color:#6b7280;font-size:12px;">Total paid</div>
            <div style="font-weight:700;font-size:16px;margin-top:4px;">${this.escape(payment)}</div>
          </div>
        </div>
      </div>

      <!-- Itinerary preview -->
      <div style="margin-top:12px;">
        <div style="font-size:13px;color:#374151;font-weight:600;margin-bottom:6px;">Itinerary snapshot</div>
        ${renderItinerary(booking?.destination?.itineraries)}
      </div>

      <!-- QR + CTA row as table for reliable spacing -->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;margin-top:20px;">
        <tr>
          <!-- fixed-width QR cell -->
          <td valign="top" style="width:130px;padding:0;">
            <div style="width:100%;text-align:left;">
              <img src="${this.escape(qrSrc)}" alt="QR code" width="96" height="96"
                style="display:block;border-radius:8px;background:#fff;padding:8px;border:1px solid ${this.BRAND.border};" />
            </div>
          </td>

          <!-- flexible text cell with left padding -->
          <td valign="top" style="padding-left:18px;">
            <div style="font-size:13px;color:#374151;line-height:1.5;margin-bottom:10px;">
              Your e-voucher contains full booking details and supplier contact information, please have it available at check-in/pickup.
            </div>

            ${voucherUrl ? `<div style="margin-bottom:10px;"><a href="${this.escape(voucherUrl)}" target="_blank" rel="noopener" style="background:${this.BRAND.button};color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:700;display:inline-block;">Download e-voucher</a></div>` : ''}

            <div style="color:${this.BRAND.subtle};font-size:13px;line-height:1.5;">
              If you can’t open the voucher, reply to this email or contact
              <a href="mailto:support@inkaulele.com" style="color:${this.BRAND.cta};text-decoration:none;">support@inkaulele.com</a>
              and include your booking reference.
            </div>
          </td>
        </tr>
      </table>

      <!-- Cancel / contact quick actions -->
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
        <a href="mailto:support@inkaulele.com?subject=Cancel booking ${encodeURIComponent(String(ref))}" style="display:inline-block;padding:10px 12px;border-radius:8px;background:#fff;border:1px solid ${this.BRAND.border};text-decoration:none;color:${this.BRAND.button};font-weight:600;">Request cancellation</a>
      </div>
    </div>
  </div>
`;



  const html = this.buildLayout({
    title: `Your e-voucher & booking from ${this.SITE_TITLE}`,
    preheader: `E-voucher ready — Ref ${ref}`,
    bodyHtml,
  
    footerNote: 'Keep this email safe, it’s proof of your booking. Contact support if anything looks wrong.',
  });

  // Build attachments
  const attachments: any[] = [];
  if (voucherPdf) {
    attachments.push({
      filename: filename ?? `Voucher-${ref}.pdf`,
      content: voucherPdf,
      contentType: 'application/pdf',
    });
  }

  // Send message
  await this.sendMail({
    from: `"${this.SITE_TITLE}" <${this.config.get('EMAIL_USER')}>`,
    to,
    bcc: bccAdmin ? this.ADMIN_EMAIL : undefined,
    subject: `Your e-voucher from ${this.SITE_TITLE} (${ref})`,
    html,
    attachments,
  });
}
// add to MailerService class

// wrapper for supplier
async sendSupplierVoucherEmail(params: {
  supplier: { name?: string, phone?: string, email?: string },
  booking: any,
  voucherUrl?: string,
  force?: boolean,
}) {
  const { supplier, booking, voucherUrl, force = false } = params;
 const to = supplier.email;
  if (!this.VOUCHER_EMAILS_ENABLED && !force) {
    this.logger.log(`Supplier voucher emailing is disabled by config. Skipping supplier email for supplier ${supplier?.name ?? supplier?.email ?? 'N/A'} (booking ${booking?.reference ?? booking?.id}).`);
    return;
  }
  const supplierName = params.supplier.name ?? 'Supplier';
  const bodyHtml = `
    <p>Hi ${supplierName},</p>
    <p>Please find attached the voucher / booking request for <strong>${params.booking.reference ?? params.booking.id}</strong>.</p>
    <p><strong>Booking dates:</strong> ${new Date(params.booking.fromDate).toLocaleDateString()} <span style="font-weight:normal;">to</span> ${new Date(params.booking.toDate).toLocaleDateString()}</p>
    ${params.voucherUrl ? `<p><a href="${this.escape(params.voucherUrl)}">Download voucher</a></p>` : ''}
    <p>Contact the operations team if anything is unclear.</p>
  `;
  const html = this.buildLayout({
    title: `Supplier voucher — ${this.SITE_TITLE}`,
    preheader: `Supplier voucher: ${params.booking.reference ?? params.booking.id}`,
    bodyHtml,
    footerNote: 'Supplier notification',
  });

  await this.sendMail({
    from: this._from(),
    to: to ?? this.ADMIN_EMAIL, // fallback to admin email if supplier email missing
    subject: `Supplier voucher — ${this.SITE_TITLE} (${params.booking.reference ?? params.booking.id})`,
    html,
  });
}

// wrapper for traveler
async sendTravelPackEmail(params: {
  to: string,
  booking: any,
  travelPackUrl?: string,
  travelPackPdfBuffer?: Buffer
}) {
  const { to, booking, travelPackUrl, travelPackPdfBuffer } = params;
  const bodyHtml = `
<p>Hi ${this.firstName(booking.travelerName) || this.escape(booking.travelerName ?? '') || 'there'},</p>

    <p>Attached is your Travel Pack (booking ref: <strong>${this.escape(booking.reference ?? booking.id)}</strong>).</p>
    ${travelPackUrl ? `<p><a href="${this.escape(travelPackUrl)}">Download your Travel Pack</a></p>` : ''}
    <p>Keep it available at check-in or show the QR code inside the pack to suppliers.</p>
  `;
  const html = this.buildLayout({
    title: `Your Travel Pack — ${this.SITE_TITLE}`,
    preheader: `Travel Pack for ${booking.reference ?? booking.id}`,
    bodyHtml,
  });

  const attachments: any[] = [];
  if (travelPackPdfBuffer) {
    attachments.push({
      filename: `TravelPack-${booking.reference ?? booking.id}.pdf`,
      content: travelPackPdfBuffer,
      contentType: 'application/pdf',
    });
  }

  await this.sendMail({
    from: this._from(),
    to,
    bcc: this.ADMIN_EMAIL,
    subject: `Your Travel Pack — ${this.SITE_TITLE} (${booking.reference ?? booking.id})`,
    html,
    attachments: attachments.length ? attachments : undefined,
  });
}


}
