// src/modules/voucher/voucher.service.ts
import { Injectable, Logger, InternalServerErrorException, NotFoundException, BadRequestException } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import * as puppeteer from 'puppeteer';
import * as crypto from 'crypto';
import streamifier from 'streamifier';
import { PrismaService } from '../../../prisma/prisma.service';
import path from 'path';
import { formatDate } from '../receipt/receipt.service';
import { MailerService } from '../mailer/mailer.service';

@Injectable()
export class VoucherService {
  private readonly logger = new Logger(VoucherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }

  // Render HTML -> PDF buffer
  async generatePdfBuffer(htmlOrBooking: any): Promise<Buffer> {
    try {
      const html =
        typeof htmlOrBooking === 'string'
          ? htmlOrBooking
          : htmlOrBooking?.__htmlOverride ?? this.buildVoucherHtml(htmlOrBooking);

      const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 1400 });
      await page.emulateMediaType('screen');
      await page.setContent(html, { waitUntil: 'networkidle0' });

      const pdfBuffer = await page.pdf({
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' },
      });

      await browser.close();
      return Buffer.from(pdfBuffer);
    } catch (err) {
      this.logger.error('Voucher PDF generation failed', err);
      throw new InternalServerErrorException('Failed to generate voucher PDF');
    }
  }

  // Cloudinary upload (raw/private)
  async uploadPdfToCloudinary(buffer: Buffer, publicId: string) {
    return new Promise<any>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'raw',
          type: 'private',
          public_id: publicId,
          overwrite: true,
          use_filename: false,
        },
        (error, result) => {
          if (error) {
            this.logger.error('Cloudinary upload failed', error);
            return reject(error);
          }
          this.logger.log(`Uploaded voucher to cloudinary: ${result?.public_id} (${result?.format})`);
          resolve(result);
        },
      );
      streamifier.createReadStream(buffer).pipe(uploadStream);
    });
  }

  // Create time-limited private download URL with an attachment filename
  async createPrivateDownloadUrl(publicId: string, filename = 'voucher.pdf', expiresSeconds = 3600) {
    const safeFilename = this.sanitizeFilename(filename);
    const expiresAt = Math.floor(Date.now() / 1000) + expiresSeconds;
    const url = cloudinary.utils.private_download_url(publicId, 'pdf', {
      resource_type: 'raw',
      type: 'private',
      expires_at: expiresAt,
      attachment: safeFilename as any,
    });
    return url;
  }
  /**
   * Main orchestration for admin: generate PDF, upload, persist, optionally create supplier voucher,
   * update booking with voucherUrl and voucherToken (or tokenHash), and email traveler/supplier.
   */
  async generateVoucherForBooking(
    bookingId: string,
opts: { supplier?: { id?: string; name?: string; phone?: string; email?: string; ref?: string; type?: string };  sendEmail?: boolean } = {}
  ) {
    // 1) load booking + relations
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { receipt: true, destination: true, voucher: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    // Require receipt presence before generating voucher (per your requirement)
    if (!booking.receipt) {
      throw new BadRequestException('Receipt missing — cannot generate voucher until receipt is available');
    }

    // 2) generate secure token (plain token returned to admin; we store hash for security)
    const tokenPlain = crypto.randomBytes(20).toString('hex'); // 40 chars
    const tokenHash = crypto.createHash('sha256').update(tokenPlain).digest('hex');

    // 3) create voucher PDF + upload (reuse your helper)
    const { url: voucherUrl, publicId, filename, buffer: pdfBuffer } = await this.prepareVoucherAndGetUrl(booking, 3600);

    // 4) persist Voucher record is done in prepareVoucherAndGetUrl; ensure booking is updated
    await this.prisma.booking.update({
      where: { id: booking.id },
      data: {
        voucherUrl,
        voucherToken: tokenPlain,       // optional: remove if you prefer only storing hash
        voucherTokenHash: tokenHash,
        voucherGeneratedAt: new Date(),
      },
    });

    // 5) (optional) create SupplierVoucher if supplier provided
    if (opts.supplier) {
      const supplier = opts.supplier;
      // call prepareSupplierVoucherAndGetUrl to add supplier voucher PDF and a SupplierVoucher record
      const supplierRes = await this.prepareSupplierVoucherAndGetUrl(booking, {
        name: supplier.name,
        type: supplier.type ?? 'OTHER',
        phone: supplier.phone,
        email: supplier.email,
        ref: supplier.ref,
      }, 3600);

      // You already create / upsert SupplierVoucher inside prepareSupplierVoucherAndGetUrl
    }

    // 6) email traveler and supplier (respect your mailer VOUCHER_EMAILS_ENABLED)
if (opts.sendEmail && booking.travelerEmail) {
  try {
    await this.mailer.sendVoucherEmail({
      to: booking.travelerEmail,
      booking,
      voucherUrl,
      voucherPdf: pdfBuffer,
      filename,
      bccAdmin: true,
      force: false,
    });
  } catch (err) {
    this.logger.warn(`Failed to send voucher email to ${booking.travelerEmail}`, err);
  }


      if (opts.supplier && opts.supplier.email) {
        try {
          await this.mailer.sendSupplierVoucherEmail({ supplier: opts.supplier, booking, voucherUrl, force: false });
        } catch (err) {
          this.logger.warn('Failed to send supplier voucher email', err);
        }
      }
    }

    // 7) return fresh booking and the plain token for admin preview (tokenPlain)
    const updated = await this.prisma.booking.findUnique({
      where: { id: booking.id },
      include: { receipt: true, voucher: true, supplierVouchers: true },
    });

    return { booking: updated, tokenPublic: tokenPlain, voucherUrl, publicId };
  }
  // High-level: generate -> upload -> upsert Voucher row -> return url + meta + buffer
  async prepareVoucherAndGetUrl(booking: any, expiresSeconds = 3600) {
    const ref = booking.reference ?? `BK-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const filename = `Inkaulele-Voucher-${ref}.pdf`;
    const publicId = `vouchers/${booking.id}/${ref}.pdf`;

    // generate
    const pdfBuf = await this.generatePdfBuffer({ __htmlOverride: this.buildVoucherHtml(booking) });

    // upload
    await this.uploadPdfToCloudinary(pdfBuf, publicId);

    // persist Voucher record (idempotent-ish)
    try {
      await this.prisma.voucher.upsert({
        where: { bookingId: booking.id },
        update: {
          publicId,
          filename,
          uploadedAt: new Date(),
        },
        create: {
          bookingId: booking.id,
          publicId,
          filename,
          uploadedAt: new Date(),
        },
      });
    } catch (err) {
      this.logger.warn('Failed to persist voucher record', err);
    }

    const url = await this.createPrivateDownloadUrl(publicId, filename, expiresSeconds);
    return { url, publicId, filename, buffer: pdfBuf };
  }
// inside VoucherService class
// inside VoucherService class (src/modules/voucher/voucher.service.ts)
async prepareSupplierVoucherAndGetUrl(
  booking: any,
  supplier: { name?: string; type?: string; phone?: string; email?: string; ref?: string },
  expiresSeconds = 3600,
) {
  const ref = booking.reference ?? `BK-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const filename = `SupplierVoucher-${(supplier.name || 'supplier').replace(/\s+/g, '-')}-${ref}.pdf`;
  const publicId = `supplier_vouchers/${booking.id}/${(supplier.name || 'supplier').replace(/\s+/g,'_')}_${ref}.pdf`;

  // generate PDF buffer for supplier voucher
  const supplierHtml = this.buildSupplierVoucherHtml(booking, supplier);
  const pdfBuf = await this.generatePdfBuffer(supplierHtml);

  // upload buffer to cloudinary
  await this.uploadPdfToCloudinary(pdfBuf, publicId);

  // persist SupplierVoucher record safely (no upsert on non-unique field)
  try {
    // try to find an existing record by publicId (or by bookingId+supplierRef)
    const existing = await this.prisma.supplierVoucher.findFirst({
      where: {
        OR: [
          { publicId: publicId },
          { bookingId: booking.id, supplierRef: supplier.ref ?? undefined, supplierName: supplier.name ?? undefined },
        ],
      },
    });

    if (existing) {
      await this.prisma.supplierVoucher.update({
        where: { id: existing.id },
        data: {
          filename,
          uploadedAt: new Date(),
          contactJson: { phone: supplier.phone ?? null, email: supplier.email ?? null },
        } as any,
      });
    } else {
      await this.prisma.supplierVoucher.create({
        data: {
          bookingId: booking.id,
          supplierName: supplier.name,
          supplierType: supplier.type,
          supplierRef: supplier.ref,
          publicId,
          filename,
          uploadedAt: new Date(),
          contactJson: { phone: supplier.phone ?? null, email: supplier.email ?? null },
        } as any,
      });
    }
  } catch (err) {
    this.logger.warn('Failed to persist supplierVoucher', err);
  }

  const url = await this.createPrivateDownloadUrl(publicId, filename, expiresSeconds);
  return { url, publicId, filename, buffer: pdfBuf };
}


private buildVoucherHtml(booking: any) {
  // brand tokens — tweak as needed
  const BRAND = {
    primary: '#9B0302', // brand red
    accent: '#0f766e',  // teal accent
    bg: '#f6f7f8',
    card: '#ffffff',
    text: '#0b0b0c',
    muted: '#6b7280',
    border: '#eef2f6',
  };

  const ref = booking.reference ?? `BK-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const traveler = booking.travelerName ?? 'Guest';
  const email = booking.travelerEmail ?? '';
  const logo = process.env.RECEIPT_LOGO_URL ?? 'https://res.cloudinary.com/dahrcnjfh/image/upload/v1759849979/inkaulele-transparent-logo.png';
  const firm = process.env.SITE_TITLE ?? 'Inkaulele Sidan';
  const currency = (booking.currency ?? 'KES').toUpperCase();
  const total = Number(booking.totalPrice ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0 });
  const nights = booking.nights ?? 0;
  const guests = (booking.adults ?? 0) + (booking.children ?? 0);
  const dest = booking.destination ?? {};
  const fromDate = booking.fromDate ? formatDate(new Date(booking.fromDate)) : '—';
  const toDate = booking.toDate ? formatDate(new Date(booking.toDate)) : '—';
  const pickup = booking.meetingPoint?.name ?? booking.pickupLocation ?? '—';
  const supplierName = booking.supplierName ?? dest.host?.name ?? '—';
  const supplierPhone = booking.supplierPhone ?? dest.host?.phone ?? '';
  const roomInfo = booking.roomId ? (booking.roomTitle ?? booking.roomName ?? '—') : (booking.durationOption?.title ?? '');
  const checkIn = booking.checkInAt ? formatDate(new Date(booking.checkInAt)) : booking.checkInAt ? new Date(booking.checkInAt).toLocaleString() : '';
  const checkOut = booking.checkOutAt ? formatDate(new Date(booking.checkOutAt)) : booking.checkOutAt ? new Date(booking.checkOutAt).toLocaleString() : '';
  const flight = booking.flightNumber ?? booking.pickup?.flightNumber ?? '';
  const airline = booking.pickup?.airline ?? booking.airline ?? '';
  const terminal = booking.pickup?.terminal ?? booking.terminal ?? '';
  const pickupAt = booking.pickup?.pickupAt ?? booking.pickupAt ?? null;
  const pickupAtFormatted = pickupAt ? formatDate(new Date(pickupAt)) + ' ' + new Date(pickupAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const vehicleType = booking.pickup?.vehicleType ?? booking.vehicleType ?? '';
  const pickupProvider = booking.pickup?.provider ?? booking.pickupProvider ?? '';
  const lat = dest.lat ?? booking.pickup?.pickupLat ?? '';
  const lng = dest.lng ?? booking.pickup?.pickupLng ?? '';
  const mapLink = lat && lng ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}` : '';

  const itinerary = booking.destination?.itineraries ?? booking.itineraries ?? [];
  const itineraryRows = (itinerary || []).map((it: any) => `
      <tr>
        <td style="padding:10px;vertical-align:top;width:90px;">
          <div style="font-weight:700;color:${BRAND.accent};">Day ${this.escapeHtml(it.day ?? '')}</div>
          <div class="muted">${this.escapeHtml(it.time ?? '')}</div>
        </td>
        <td style="padding:10px;vertical-align:top;">
          <div style="font-weight:700">${this.escapeHtml(it.title ?? '')}</div>
          ${it.description ? `<div style="margin-top:6px;color:${BRAND.text};">${this.escapeHtml(it.description)}</div>` : ''}
          ${it.durationMinutes ? `<div style="margin-top:6px;font-size:13px;color:${BRAND.muted}">${this.escapeHtml(String(it.durationMinutes))} mins</div>` : ''}
        </td>
      </tr>
    `).join('') || `<tr><td style="padding:14px;">Full itinerary included in attached voucher / travel pack.</td></tr>`;

  // QR / deep link: prefer voucherUrl if set on booking
  const qrData = booking.voucherUrl ?? booking.travelPackUrl ?? ref;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qrData)}`;

  // Inclusions/exclusions
const inclusions: string[] = (dest.inclusions ?? booking.inclusions ?? []) as string[];
const exclusions: string[] = (dest.exclusions ?? booking.exclusions ?? []) as string[];

  return `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Voucher — ${this.escapeHtml(ref)}</title>
<style>
  :root{
    --primary:${BRAND.primary};
    --accent:${BRAND.accent};
    --bg:${BRAND.bg};
    --card:${BRAND.card};
    --text:${BRAND.text};
    --muted:${BRAND.muted};
    --border:${BRAND.border};
  }
  html,body{margin:0;padding:0;background:var(--bg);font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;color:var(--text);-webkit-font-smoothing:antialiased;}
  .page{width:820px;margin:22px auto;box-shadow:0 10px 34px rgba(2,6,23,0.08);border-radius:12px;overflow:hidden;background:var(--card);}
  header{display:flex;justify-content:space-between;align-items:center;padding:22px 28px;border-bottom:1px solid var(--border);}
  .brand{display:flex;gap:14px;align-items:center;}
  .brand img{height:60px;object-fit:contain;}
  .meta{text-align:right;font-size:13px;color:var(--muted);}
  main{display:flex;gap:20px;padding:24px 28px;}
  .left{flex:1;}
  .right{width:300px;}
  .hero{background:linear-gradient(180deg, rgba(15,118,110,0.05), transparent);padding:14px;border-radius:10px;border:1px solid var(--border);}
  h1{margin:0;font-size:20px;color:var(--accent);}
  .muted{color:var(--muted);font-size:13px;}
  .card{background:var(--card);border-radius:10px;padding:14px;border:1px solid var(--border);margin-top:12px;box-shadow:0 6px 18px rgba(2,6,23,0.03);}
  .row{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;}
  .chip{background:transparent;border-radius:8px;padding:12px;border:1px dashed var(--border);min-width:140px;font-size:13px;}
  table{width:100%;border-collapse:collapse;margin-top:12px;}
  td{vertical-align:top;padding:6px 0;}
  .itinerary{margin-top:12px;border-radius:8px;overflow:hidden;border:1px solid var(--border);}
  .itinerary tr td{border-bottom:1px solid #f6f7f8;}
  .pricebox{background:linear-gradient(180deg, rgba(155,3,2,0.06), transparent);padding:12px;border-radius:8px;border:1px solid rgba(155,3,2,0.08);text-align:right;}
  .small{font-size:12px;color:var(--muted);}
  .qr{display:flex;gap:12px;align-items:center;margin-top:12px;}
  footer{padding:16px 28px;border-top:1px solid var(--border);background:#fbfbfb;font-size:13px;color:var(--muted);display:flex;justify-content:space-between;align-items:center;}
  a { color: var(--primary); text-decoration: none; }
  @media print {
    .page{box-shadow:none;margin:0;border-radius:0;}
  }
</style>
</head>
<body>
  <div class="page">
    <header>
      <div class="brand" role="banner">
        <img src="${this.escapeHtml(logo)}" alt="${this.escapeHtml(firm)} logo" />
        <div>
          <div style="font-weight:800;font-size:16px;">${this.escapeHtml(firm)}</div>
          <div class="small">Booking confirmation & e-voucher</div>
        </div>
      </div>
      <div class="meta" role="doc-meta">
        <div>Ref: <strong>${this.escapeHtml(ref)}</strong></div>
        <div>${this.escapeHtml(new Date(booking.createdAt ?? Date.now()).toLocaleString())}</div>
        <div style="margin-top:6px;">${this.escapeHtml(email)}</div>
      </div>
    </header>

    <main>
      <div class="left" role="main">
        <div class="hero">
          <h1>${this.escapeHtml(dest.title ?? 'Destination')}</h1>
          <div class="muted">${this.escapeHtml(dest.region ?? dest.country ?? '')}</div>
        </div>

        <div class="card" aria-labelledby="booking-details">
          <div id="booking-details" style="display:flex;justify-content:space-between;align-items:flex-start;">
            <div>
              <div class="small">Traveler</div>
              <div style="font-weight:700">${this.escapeHtml(traveler)}</div>
              <div class="muted">${this.escapeHtml(email)} • ${this.escapeHtml(String(booking.travelerPhone ?? ''))}</div>
            </div>
            <div style="text-align:right;">
              <div class="small">Total paid</div>
              <div style="font-weight:800;font-size:20px;color:var(--primary)">${this.escapeHtml(currency)} ${this.escapeHtml(total)}</div>
            </div>
          </div>

          <div class="row" style="margin-top:14px;">
            <div class="chip">
              <div class="small">Dates</div>
              <div style="font-weight:700">${this.escapeHtml(fromDate)} — ${this.escapeHtml(toDate)}</div>
              <div class="small">${nights} night${nights !== 1 ? 's' : ''}</div>
            </div>

            <div class="chip">
              <div class="small">Guests</div>
              <div style="font-weight:700">${this.escapeHtml(String(guests))}</div>
              <div class="muted">Adults: ${this.escapeHtml(String(booking.adults ?? 0))}${booking.children ? ` • Children: ${this.escapeHtml(String(booking.children))}` : ''}</div>
            </div>

            <div class="chip">
              <div class="small">Rooms</div>
              <div style="font-weight:700">${this.escapeHtml(String(booking.rooms ?? booking.unitsBooked ?? 1))}</div>
              <div class="muted">${this.escapeHtml(roomInfo)}</div>
            </div>

            <div class="chip">
              <div class="small">Check-in / out</div>
              <div style="font-weight:700">${this.escapeHtml(checkIn || '—')} ${checkOut ? `• ${this.escapeHtml(checkOut)}` : ''}</div>
            </div>
          </div>

          <div class="itinerary" role="region" aria-label="itinerary">
            <table role="presentation" width="100%">
              ${itineraryRows}
            </table>
          </div>

          <div style="display:flex;gap:12px;align-items:flex-start;margin-top:12px;flex-wrap:wrap;">
            <div style="flex:1;">
              <div style="font-weight:700">Pickup & Flight</div>
              <div class="muted" style="margin-top:6px;">
                ${flight ? `<div>Flight: <strong>${this.escapeHtml(flight)}</strong> ${airline ? `• ${this.escapeHtml(airline)}` : ''} ${terminal ? `• Terminal ${this.escapeHtml(terminal)}` : ''}</div>` : ''}
                <div>Pickup time: <strong>${this.escapeHtml(pickupAtFormatted || pickup)}</strong></div>
                <div>Provider: <strong>${this.escapeHtml(String(pickupProvider || booking.pickupProvider || '—'))}</strong> ${vehicleType ? `• ${this.escapeHtml(vehicleType)}` : ''}</div>
                <div>Pickup location: ${this.escapeHtml(String(booking.pickupAddress ?? booking.meetingPoint?.address ?? booking.pickupLocation ?? '-'))}</div>
              </div>
            </div>

            <div style="width:220px;">
              <div class="pricebox">
                <div class="small">Booking summary</div>
                <div style="font-weight:700;margin-top:6px;">Ref ${this.escapeHtml(ref)}</div>
                <div class="small" style="margin-top:6px;">Booked on ${this.escapeHtml(new Date(booking.createdAt ?? Date.now()).toLocaleDateString())}</div>
              </div>

              <div style="margin-top:10px;text-align:center;">
                <img src="${this.escapeHtml(qrSrc)}" width="140" height="140" alt="Voucher QR" style="border-radius:8px;border:1px solid var(--border);background:#fff;padding:6px;" />
                <div class="small" style="margin-top:8px;">QR code will be used by our partners to verify your booking.</div>
              </div>
            </div>
          </div>

          <div style="display:flex;gap:12px;align-items:flex-start;margin-top:12px;flex-wrap:wrap;">
            <div style="flex:1;">
              <div style="font-weight:700">Supplier</div>
              <div class="muted" style="margin-top:6px;">
                ${this.escapeHtml(supplierName)} <br />
                ${supplierPhone ? `Phone: ${this.escapeHtml(supplierPhone)} • ` : ''} ${this.escapeHtml(String(booking.supplierEmail ?? dest.host?.email ?? ''))}
              </div>
            </div>

            <div style="min-width:220px;">
              <div style="font-weight:700">Location & support</div>
              <div class="muted" style="margin-top:6px;">
                ${mapLink ? `<div><a href="${this.escapeHtml(mapLink)}" target="_blank">Open map</a></div>` : ''}
                <div style="margin-top:6px;">Need help? Email <a href="mailto:support@inkaulele.com">support@inkaulele.com</a> or call ${this.escapeHtml(process.env.ADMIN_PHONE ?? 'support')}.</div>
              </div>
            </div>
          </div>
        </div>

        <div class="card" style="margin-top:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="font-weight:700">What’s included</div>
            <div class="small">Important information</div>
          </div>
          <div style="display:flex;gap:12px;margin-top:10px;flex-wrap:wrap;">
            <div style="flex:1;">
              <ul style="margin:0;padding-left:18px;color:var(--text)">
                ${inclusions.map(i => `<li class="muted">${this.escapeHtml(i)}</li>`).join('') || `<li class="muted">See voucher / travel pack for inclusions</li>`}
              </ul>
            </div>
            <div style="flex:1;">
              <div style="font-weight:700">Exclusions</div>
              <ul style="margin:6px 0 0 18px;color:var(--text)">
                ${exclusions.map(x => `<li class="muted">${this.escapeHtml(x)}</li>`).join('') || `<li class="muted">See voucher / travel pack for exclusions</li>`}
              </ul>
            </div>
          </div>
        </div>

        <div class="card" style="margin-top:12px;">
          <div style="font-weight:700">Cancellation & policies</div>
          <div class="muted" style="margin-top:8px;font-size:13px;">
            <p style="margin:0 0 6px 0;">Standard cancellation and amendment policies apply. Please refer to your travel pack for supplier-specific terms. For urgent changes contact <a href="mailto:support@inkaulele.com">support@inkaulele.com</a>.</p>
            <p style="margin:0;color:#6b7280;font-size:12px;">Note: Some suppliers require reconfirmation; always carry this voucher and your ID at check-in.</p>
          </div>
        </div>
      </div>

      <aside class="right" role="complementary">
        <div class="card">
          <div style="font-weight:700">Payment</div>
          <table style="margin-top:10px;">
            <tr><td class="small">Total</td><td style="text-align:right;font-weight:700">${this.escapeHtml(currency)} ${this.escapeHtml(total)}</td></tr>
            ${booking.breakdown ? Object.entries(booking.breakdown).map(([k,v]) => `<tr><td class="muted small">${this.escapeHtml(k)}</td><td style="text-align:right">${this.escapeHtml(String(v))}</td></tr>`).join('') : ''}
          </table>
        </div>

        <div class="card" style="margin-top:12px;">
          <div style="font-weight:700">Contact & quick actions</div>
          <div style="margin-top:8px;" class="muted">
            <div style="margin-bottom:8px;">Support: <a href="mailto:support@inkaulele.com">support@inkaulele.com</a></div>
            <div>Supplier: ${this.escapeHtml(supplierName)}</div>
            <div>${supplierPhone ? `Phone: ${this.escapeHtml(supplierPhone)}` : ''}</div>
            <div style="margin-top:8px;"><a href="mailto:support@inkaulele.com?subject=Question about booking ${encodeURIComponent(ref)}">Email support about this booking</a></div>
          </div>
        </div>

        <div class="card" style="margin-top:12px;">
          <div style="font-weight:700">Need to change?</div>
          <div class="muted" style="margin-top:8px;">If you need to modify your booking, please contact support with your booking reference. For supplier-specific changes call the number shown above.</div>
        </div>
      </aside>
    </main>

    <footer>
      <div>Thank you for booking with ${this.escapeHtml(firm)} — Please keep this voucher safe.</div>
      <div class="small">Powered by ${this.escapeHtml(firm)}</div>
    </footer>
  </div>
</body>
</html>
  `;
}


private buildSupplierVoucherHtml(booking: any, supplier: any) {
  // compact modern supplier voucher layout focused on actions
  const ref = booking.reference ?? `BK-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const firm = process.env.SITE_TITLE ?? 'Inkaulele Sidan';
  const supplierContact = supplier.phone ? `Phone: ${supplier.phone}` : (supplier.email ? `Email: ${supplier.email}` : 'Contact: —');
  const fromDate = booking.fromDate ? formatDate(new Date(booking.fromDate)) : '—';
  const toDate = booking.toDate ? formatDate(new Date(booking.toDate)) : '—';
  const guests = (booking.adults ?? 0) + (booking.children ?? 0);
  const pickup = booking.meetingPoint?.name ?? booking.pickupLocation ?? 'See details';
  const pickupAt = booking.pickup?.pickupAt ?? booking.pickupAt ?? '';
  const pickupAtFmt = pickupAt ? formatDate(new Date(pickupAt)) + ' ' + new Date(pickupAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const flight = booking.flightNumber ?? booking.pickup?.flightNumber ?? '';
  const airline = booking.pickup?.airline ?? booking.airline ?? '';
  const terminal = booking.pickup?.terminal ?? booking.terminal ?? '';
  const vehicleType = booking.pickup?.vehicleType ?? booking.vehicleType ?? '';
  const pickupProvider = booking.pickup?.provider ?? booking.pickupProvider ?? '';

  return `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Supplier Voucher — ${this.escapeHtml(ref)}</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;color:#111827;margin:0;padding:18px;background:#fff;}
  .wrap{max-width:720px;margin:0 auto;border:1px solid #eef2f6;border-radius:10px;padding:18px;}
  .header{display:flex;justify-content:space-between;align-items:center;}
  .muted{color:#6b7280;font-size:13px;}
  h2{margin:6px 0 0 0;color:#0f766e;}
  .section{margin-top:12px;padding-top:12px;border-top:1px solid #f3f4f6;}
  table{width:100%;border-collapse:collapse;margin-top:8px;}
  td{padding:6px 0;vertical-align:top;}
  .actions{margin-top:12px;display:flex;gap:10px;}
  .btn{display:inline-block;padding:8px 12px;border-radius:8px;text-decoration:none;font-weight:700;}
  .btn-confirm{background:#0f766e;color:#fff;}
  .btn-contact{background:#fff;border:1px solid #eef2f6;color:#0b0b0c;}
  .small{font-size:12px;color:#6b7280;}
</style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <div>
        <div style="font-weight:800">${this.escapeHtml(firm)}</div>
        <div class="small">Supplier booking voucher</div>
      </div>
      <div class="muted">Ref: <strong>${this.escapeHtml(ref)}</strong></div>
    </div>

    <h2>${this.escapeHtml(booking.destination?.title ?? 'Booking')}</h2>
    <div class="muted">Dates: ${this.escapeHtml(fromDate)} — ${this.escapeHtml(toDate)} • Guests: ${this.escapeHtml(String(guests))}</div>

    <div class="section">
      <div style="font-weight:700">Booking details</div>
      <table>
        <tr><td class="small">Reference</td><td><strong>${this.escapeHtml(ref)}</strong></td></tr>
        <tr><td class="small">Guest</td><td>${this.escapeHtml(booking.travelerName ?? 'Guest')} • ${this.escapeHtml(booking.travelerPhone ?? '')}</td></tr>
        <tr><td class="small">Room / package</td><td>${this.escapeHtml(booking.roomTitle ?? booking.durationOption?.title ?? '—')}</td></tr>
        <tr><td class="small">Supplier ref</td><td>${this.escapeHtml(supplier.ref ?? '')}</td></tr>
      </table>
    </div>

    <div class="section">
      <div style="font-weight:700">Pickup & flight</div>
      <div class="muted" style="margin-top:6px;">
        ${flight ? `<div>Flight: <strong>${this.escapeHtml(flight)}</strong> ${airline ? `• ${this.escapeHtml(airline)}` : ''} ${terminal ? `• T${this.escapeHtml(terminal)}` : ''}</div>` : ''}
        <div>Pickup time: <strong>${this.escapeHtml(pickupAtFmt || pickup)}</strong></div>
        <div>Provider: <strong>${this.escapeHtml(String(pickupProvider || '—'))}</strong> ${vehicleType ? `• ${this.escapeHtml(vehicleType)}` : ''}</div>
        <div>Pickup location: ${this.escapeHtml(booking.pickupAddress ?? booking.meetingPoint?.address ?? pickup)}</div>
      </div>
    </div>

    <div class="section">
      <div style="font-weight:700">Action required</div>
      <div class="muted" style="margin-top:6px;">
        Please confirm availability for the dates above and call operations if there are any issues. When ready, reply with supplier reference and ETA for the transfer. Contact operations: ${this.escapeHtml(process.env.ADMIN_PHONE ?? 'admin')}.
      </div>

      <div class="actions">
        <a class="btn btn-confirm" href="mailto:${this.escapeHtml(process.env.ADMIN_EMAIL ?? 'operations@example.com')}?subject=Confirm%20booking%20${encodeURIComponent(ref)}">Confirm</a>
        <a class="btn btn-contact" href="mailto:${this.escapeHtml(process.env.ADMIN_EMAIL ?? 'operations@example.com')}?subject=Question%20about%20${encodeURIComponent(ref)}">Contact Ops</a>
      </div>
    </div>

    <div class="section">
      <div style="font-weight:700">Supplier contact</div>
      <div class="muted" style="margin-top:6px;">
        ${this.escapeHtml(String(supplier.name ?? 'Supplier'))} • ${this.escapeHtml(String(supplier.phone ?? ''))} • ${this.escapeHtml(String(supplier.email ?? ''))}
      </div>
    </div>

    <div class="section small" style="margin-top:14px;">
      Please keep this voucher and present it to the guest on arrival. This voucher contains booking and supplier contact details required for check-in and transfers.
    </div>
  </div>
</body>
</html>
  `;
}


  private escapeHtml(s: any) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private sanitizeFilename(name: string) {
    const base = path.basename(name || 'voucher.pdf');
    return base.replace(/[^\w\s.\-()_,]/g, '_');
  }
}
