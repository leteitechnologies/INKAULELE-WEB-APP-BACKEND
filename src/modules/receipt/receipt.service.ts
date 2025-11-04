// // src/modules/receipt/receipt.service.ts
// import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
// import { v2 as cloudinary } from 'cloudinary';
// import * as puppeteer from 'puppeteer';
// import * as crypto from 'crypto';
// import streamifier from 'streamifier';
// import { PrismaService } from '../../../prisma/prisma.service';
// import path from 'path';
// import dns from 'dns';
// import https from 'https';

// @Injectable()
// export class ReceiptService {
//   private readonly logger = new Logger(ReceiptService.name);

//   // Upload retry settings
//   private readonly uploadRetries = 3;
//   private readonly baseBackoffMs = 700; // exponential backoff base
//   private readonly perAttemptTimeoutMs = 30_000; // abort an upload attempt after this

//   constructor(private prisma: PrismaService) {
//     // Prefer IPv4 if the runtime supports ordering (helps when infra doesn't have IPv6)
//     if (typeof dns.setDefaultResultOrder === 'function') {
//       try {
//         dns.setDefaultResultOrder('ipv4first');
//         this.logger.debug('DNS result order set to ipv4first');
//       } catch (e) {
//         this.logger.warn('Could not set DNS default result order', e);
//       }
//     }

//     // Force global https agent to prefer IPv4 and keepalive for connection reuse.
//     // This affects modules using node's https (Cloudinary SDK uses https under the hood).
//     https.globalAgent = new https.Agent({
//       keepAlive: true,
//       family: 4,
//       timeout: 30_000,
//       maxSockets: 50,
//     });

//     cloudinary.config({
//       cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
//       api_key: process.env.CLOUDINARY_API_KEY,
//       api_secret: process.env.CLOUDINARY_API_SECRET, // NEVER expose this to clients
//       secure: true,
//     });
//   }

//   /**
//    * Render HTML (or booking object) to PDF buffer using Puppeteer.
//    * Accepts:
//    *  - raw HTML string
//    *  - object with __htmlOverride
//    *  - booking object (fallback -> buildReceiptHtml)
//    */
//   async generatePdfBuffer(input: any): Promise<Buffer> {
//     try {
//       let html: string;
//       if (typeof input === 'string') {
//         html = input;
//       } else if (input && typeof input === 'object' && input.__htmlOverride) {
//         html = input.__htmlOverride;
//       } else {
//         html = this.buildReceiptHtml(input);
//       }

//       const browser = await puppeteer.launch({
//         args: ['--no-sandbox', '--disable-setuid-sandbox'],
//       });
//       const page = await browser.newPage();

//       await page.setViewport({ width: 1200, height: 1400 });
//       await page.emulateMediaType('screen');
//       await page.setContent(html, {
//         waitUntil: 'load',
//         timeout: 0,
//       });

//       const pdfBuffer = await page.pdf({
//         printBackground: true,
//         preferCSSPageSize: true,
//         margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' },
//       });

//       await browser.close();
//       return Buffer.from(pdfBuffer);
//     } catch (err) {
//       this.logger.error('PDF generation failed', err);
//       throw new InternalServerErrorException('Failed to generate PDF');
//     }
//   }

//   private buildReceiptHtml(booking: any) {
//     const ref = booking.reference ?? `BK-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
//     const email = booking.travelerEmail ?? '';
//     const createdAt = new Date(booking.createdAt ?? Date.now());
//     const datePretty = createdAt.toLocaleString(undefined, {
//       month: 'short',
//       day: 'numeric',
//       year: 'numeric',
//       hour: '2-digit',
//       minute: '2-digit',
//     });

//     const logo =
//       process.env.RECEIPT_LOGO_URL ??
//       'https://res.cloudinary.com/dahrcnjfh/image/upload/v1759849979/inkaulele-transparent-logo.png';
//     const firm = process.env.SITE_TITLE ?? 'Inkaulele Sidan';
//     const poweredBy = process.env.POWERED_BY ?? 'Infineat Software';
//     const currency = (booking.currency ?? 'KES').toUpperCase();
//     const total = new Intl.NumberFormat(undefined, {
//       style: 'currency',
//       currency: booking.currency ?? 'KES',
//       minimumFractionDigits: 2,
//     }).format(Number(booking.totalPrice ?? 0));
//     const nights = booking.nights ?? 0;
//     const guests = (booking.adults ?? 0) + (booking.children ?? 0);
//     const dest =
//       booking.destination?.title ?? (booking.destinationId ? String(booking.destinationId) : '—');
//     const destRegion = booking.destination?.region ?? booking.destination?.country ?? '—';

//     const COLORS = {
//       teal: '#0f766e',
//       charcoal: '#0b1220',
//       gold: '#D6A34B',
//       red: '#9B0302',
//       muted: '#6b7280',
//       bg: '#ffffff', // white sheet
//     };

//     const watermarkSvg = encodeURIComponent(`
//   <svg xmlns='http://www.w3.org/2000/svg' width='400' height='200'>
//     <defs>
//       <pattern id='tile' patternUnits='userSpaceOnUse' width='400' height='200'>
//         <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle'
//           font-family='system-ui, -apple-system, "Segoe UI", Roboto, Arial'
//           font-size='28' font-weight='700'
//           fill='rgba(11,18,32,0.045)' transform='rotate(-30 200 100)'>
//           ${escapeHtml(firm)} • ${escapeHtml(ref)}
//         </text>
//       </pattern>
//     </defs>
//     <rect width='100%' height='100%' fill='url(#tile)' />
//   </svg>
//   `);

//     return `<!doctype html>
// <html>
// <head>
// <meta charset="utf-8" />
// <meta name="viewport" content="width=device-width,initial-scale=1" />
// <title>Receipt — ${escapeHtml(ref)}</title>
// <style>
//   @page { size: A4; margin: 0; }
//   html,body { margin:0; padding:0; height:100%; background:#f3f4f6; font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color:${COLORS.charcoal}; -webkit-font-smoothing:antialiased; }

//   .sheet {
//     width: 210mm;
//     height: 297mm;
//     box-sizing: border-box;
//     margin: 0 auto;
//     padding: 18mm;
//     background: ${COLORS.bg};
//     position: relative;
//     overflow: hidden;
//   }

//   .watermark {
//     position: absolute;
//     inset: 0;
//     opacity: 0.08;
//     pointer-events: none;
//     background-image: url('data:image/svg+xml;utf8,${watermarkSvg}');
//     background-repeat: repeat;
//     background-position: center;
//     background-size: 400px 200px;
//     z-index: 0;
//   }

//   header { display:flex; justify-content:space-between; align-items:center; gap:12mm; padding-bottom:6mm; border-bottom:1px solid rgba(11,18,32,0.06); z-index:1; }
//   .brand { display:flex; align-items:center; gap:10px; min-width:0; }
//   .brand img { height:42px; width:auto; border-radius:6px; }
//   .brand .name { font-weight:800; font-size:16px; color:${COLORS.charcoal}; line-height:1; }
//   .meta { text-align:right; font-size:12px; color:${COLORS.muted}; min-width:0; }
//   .meta .ref { display:block; margin-top:6px; font-family: monospace; font-weight:700; color:${COLORS.teal}; }

//   main { display:grid; grid-template-columns: 1fr 72mm; gap:10mm; margin-top:8mm; align-items:start; z-index:1; }

//   .panel { background: linear-gradient(180deg,#fff,#fff); border-radius:16px; padding:12px; border:1px solid rgba(11,18,32,0.04); box-sizing:border-box; display:flex; flex-direction:column; min-height:140px; position:relative; }
// .panel-help {
//   display: flex;
//   justify-content: center;
//   align-items: center;
//   text-align: center;
//   padding: 20px;
//   min-height: 100px;
//   border: 1px dashed rgba(11,18,32,0.08);
//   background: #fafafa;
//   border-radius: 12px;
// }
//   /* HERO band (destination) inside panel */
// .hero-wrap {
//   border-radius: 12px;
//   padding: 12px 14px;
//   background: linear-gradient(180deg, #f9fafb 0%, #ffffff 100%);
//   border: 1px solid #eef2f6;
//   box-shadow: 0 1px 2px rgba(0,0,0,0.03);
// }

//   .hero-wrap .dest-title {
//     font-size: 18px;
//     font-weight: 900;
//     line-height: 1.05;
//     margin: 0;
//     letter-spacing: -0.01em;
//   color: ${COLORS.charcoal};
//   }
//   .hero-wrap .dest-sub {
//     font-size: 12px;

//     margin-top: 4px;
//     color: #6b7280;
//   }

//   /* compact meta row under hero */
//   .meta-row {
//     display:flex;
//     gap:18px;
//     align-items:center;
//     margin-top:10px;
//     flex-wrap:wrap;
//   }
//   .meta-row .k { font-size:12px; color:${COLORS.muted}; margin:0; }
//   .meta-row .v { font-weight:700; font-size:13px; color:${COLORS.charcoal}; margin-top:4px; }

//   .two-cols { display:flex; gap:12px; margin-top:12px; }
//   .k { font-size:12px; color:${COLORS.muted}; }
//   .v { font-weight:700; font-size:13px; color:${COLORS.charcoal}; }

//   .items { margin-top:10px; border-top:1px dashed rgba(11,18,32,0.06); padding-top:10px; }
//   .item { display:flex; justify-content:space-between; padding:8px 0; font-size:13px; border-bottom:1px solid rgba(11,18,32,0.02); }
//   .item .label { color:${COLORS.charcoal}; }
//   .item .value { font-weight:700; }

//   /* nights pinned at bottom of panel */
//   .panel-bottom {
//     margin-top:12px;
//     display:flex;
//     justify-content:space-between;
//     align-items:flex-end;
//     margin-top:auto; /* push to bottom when panel grows */
//   }
//   .nights { font-size:12px; color:${COLORS.muted}; font-weight:700; }

//   aside { display:flex; flex-direction:column; gap:9mm; align-items:stretch; }
//   /* updated aside summary: stronger gradient band */
//   .summary {
//  background: #f9fafb;
//     border-radius:12px;
//     padding:14px;
//     border:1px solid rgba(11,18,32,0.06);
//     text-align:center;
// color: #111827;
//    box-shadow: 0 2px 8px rgba(0,0,0,0.04);
//   }
//   .summary .label { font-size:12px; opacity:0.95;   color: #6b7280; }
//   .summary .amount { font-size:22px; font-weight:900; margin-top:8px;  color: #9B0302; }
//   .summary .qr { display:flex; gap:8px; align-items:center; justify-content:center; margin-top:10px; }
//   .summary .qr img { width:90px; height:90px; border-radius:8px; border: 1px solid rgba(0,0,0,0.06); padding:6px;  background: white;; }

//   .ref-card { background:#fff; border-radius:8px; padding:10px; border:1px solid rgba(11,18,32,0.04); text-align:center; font-family:monospace; font-weight:700; color:${COLORS.charcoal}; }

// footer {
//   margin-top: 12mm;
//   display: flex;
//   justify-content: space-between;
//   align-items: center;
//   font-size: 12px;
//   color: ${COLORS.muted};
//   padding-top: 6mm;
//   border-top: 1px solid rgba(11,18,32,0.06);
//   gap: 8mm;
// }
// footer .notes {
//   flex: 1;
//   max-width: 75%; /* prevents overflowing into the powered section */
//   line-height: 1.4;
// }

// footer div:last-child {
//   white-space: nowrap; /* ✅ prevents wrapping into two lines */
//   text-align: right;
//   flex-shrink: 0; /* ✅ keeps it from shrinking */
// }


//   .sheet, header, main, footer, .panel, aside { page-break-inside: avoid; }
//   .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

//   @media print {
//     .sheet { box-shadow:none; margin:0; width:210mm; height:297mm; }
//     .watermark { opacity:0.06; top: 60mm; }
//   }
// </style>
// </head>
// <body>
//   <div class="sheet" role="document">
//     <div class="watermark" aria-hidden="true"></div>

//     <header>
//       <div class="brand">
//         <img src="${escapeHtml(logo)}" alt="${escapeHtml(firm)} logo" />
//         <div>
//           <div class="name">${escapeHtml(firm)}</div>
//           <div class="muted" style="font-size:12px">Official booking receipt</div>
//         </div>
//       </div>

//       <div class="meta">
//         <div>${escapeHtml(datePretty)}</div>
//         <div class="ref">Ref: ${escapeHtml(ref)}</div>
//         <div class="truncate" style="max-width:80mm">${escapeHtml(email)}</div>
//       </div>
//     </header>

//     <main>
//       <!-- LEFT: details -->
//       <div>
//         <div class="panel" aria-labelledby="booking-details">
//           <!-- HERO band -->
//           <div class="hero-wrap" role="region" aria-label="destination">
//             <div class="dest-title">${escapeHtml(dest)}</div>
//             <div class="dest-sub">${escapeHtml(destRegion)}</div>
//           </div>

//           <!-- compact meta row: dates, traveler, guests (inline) -->
//           <div class="meta-row" role="group" aria-label="booking-meta">
//             <div>
//               <div class="k">Dates</div>
//               <div class="v">${escapeHtml(formatDate(booking.fromDate))} <span style="font-weight:normal">to</span> ${escapeHtml(formatDate(booking.toDate))}</div>
//             </div>

//             <div>
//               <div class="k">Traveler</div>
//               <div class="v" style="margin-top:6px">${escapeHtml(booking.travelerName ?? '—')}</div>
//             </div>

//             <div>
//               <div class="k">Guests</div>
//               <div class="v" style="margin-top:6px">${guests}</div>
//             </div>
            
//             <div>
//               <div class="k">Duration</div>
//               <div class="v" style="margin-top:6px">${nights} night${nights !== 1 ? 's' : ''}</div>
//             </div>
//           </div>

//           <!-- line items -->
//           <div class="items" aria-label="line items">
//             ${(booking.breakdown && typeof booking.breakdown === 'object')
//               ? Object.entries(booking.breakdown).map(([k, v]: any) => `<div class="item"><div class="label">${escapeHtml(k)}</div><div class="value">${escapeHtml(String(v))}</div></div>`).join('')
//               : `<div class="item"><div class="label">All Inclusive</div><div class="value">${escapeHtml(total)}</div></div>`
//             }
//           </div>
//         </div>
//         <div style="height:10mm"></div>
             
// <!-- small help panel -->
// <div class="panel-help">
//   <div>
//     <div style="font-weight:800; font-size:14px;">Need help?</div>
//     <div class="k" style="margin-top:6px; font-size:12px;">
//       Email <a href="mailto:support@inkaulele.com" 
//         style="color:${COLORS.teal}; text-decoration:none; font-weight:600;">
//         support@inkaulele.com
//       </a>
//     </div>
//   </div>
// </div>

//       </div>

//       <!-- RIGHT: summary -->
//       <aside>
//         <div class="summary" role="complementary" aria-label="payment summary">
//           <div class="label">Total paid</div>
//           <div class="amount">${escapeHtml(total)}</div>
//           <div class="qr">
//             <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(booking.voucherUrl ?? ref)}" alt="QR code" />
//           </div>
//            <div style="font-size:11px;color:${COLORS.muted};margin-top:6px">
//             Used by our partners to verify your booking.
//           </div>
//         </div>

//         <div class="ref-card">
//           ${escapeHtml(ref)}
//           <div style="font-size:11px;color:${COLORS.muted};margin-top:6px">Keep for check-in</div>
//         </div>
//       </aside>
//     </main>

//     <footer>
// <div class="notes">
//   We're delighted to have you traveling with ${escapeHtml(firm)}! This receipt serves as proof of payment at check-in.
// </div>

//       <div style="font-size:12px;color:${COLORS.muted}">Powered by ${escapeHtml(poweredBy)}</div>
//     </footer>
//   </div>
// </body>
// </html>`;
//   }

//   // Upload buffer to Cloudinary as raw/private and return result
//   async uploadPdfToCloudinary(buffer: Buffer, publicId: string) {
//     // wrapper that attempts multiple times with backoff
//     let attempt = 0;
//     let lastErr: any = null;

//     while (attempt < this.uploadRetries) {
//       attempt += 1;
//       const attemptLabel = `Cloudinary upload attempt ${attempt}/${this.uploadRetries} (publicId=${publicId})`;
//       this.logger.debug(attemptLabel);

//       try {
//         const result = await this.performUploadOnce(buffer, publicId, this.perAttemptTimeoutMs);
//         this.logger.debug(`${attemptLabel} succeeded`);
//         return result;
//       } catch (err: any) {
//         lastErr = err;
//         // detect network-ish errors to decide whether to retry
//         const code = err && (err.code || (err[0] && err[0].code));
//         const isNetworkError = this.isNetworkError(err) || code === 'ETIMEDOUT' || code === 'ENETUNREACH';

//         this.logger.warn(`${attemptLabel} failed`, { attempt, code: code ?? err?.name ?? 'unknown', message: err?.message ?? String(err) });

//         if (attempt >= this.uploadRetries || !isNetworkError) {
//           // no more retries or non-network error -> throw
//           this.logger.error('Cloudinary upload: no more retries or non-retryable error', err);
//           throw err;
//         }

//         // backoff before retry
//         const backoff = this.baseBackoffMs * Math.pow(2, attempt - 1);
//         this.logger.debug(`Waiting ${backoff}ms before next upload attempt`);
//         await new Promise((r) => setTimeout(r, backoff));
//       }
//     }

//     // if we exit loop without return
//     this.logger.error('Cloudinary upload failed after retries', lastErr);
//     throw lastErr ?? new Error('Cloudinary upload failed');
//   }

//   // single attempt upload (one try) - returns Promise that resolves or rejects
//   private performUploadOnce(buffer: Buffer, publicId: string, timeoutMs: number) {
//     return new Promise<any>((resolve, reject) => {
//       let finished = false;
//       const onDone = (err: any, res?: any) => {
//         if (finished) return;
//         finished = true;
//         if (err) return reject(err);
//         resolve(res);
//       };

//       // create upload_stream
//       const uploadStream = cloudinary.uploader.upload_stream(
//         {
//           resource_type: 'raw',
//           type: 'private',
//           public_id: publicId,
//           overwrite: true,
//           use_filename: false,
//         },
//         onDone,
//       );

//       // pipe buffer to stream
//       try {
//         const read = streamifier.createReadStream(buffer);
//         read.pipe(uploadStream);
//       } catch (e) {
//         return reject(e);
//       }

//       // guard with timeout for the attempt
//       const to = setTimeout(() => {
//         if (finished) return;
//         finished = true;
//         // attempt to destroy stream (best-effort)
//         try {
//           uploadStream.destroy(new Error('upload attempt timed out'));
//         } catch (_) {
//           // ignore
//         }
//         reject(Object.assign(new Error('Cloudinary upload attempt timed out'), { code: 'ETIMEDOUT' }));
//       }, timeoutMs);

//       // cleanup when finished
//       const cleanup = () => clearTimeout(to);
//       // wrap resolution to cleanup timer
//       const wrappedResolve = (res: any) => {
//         cleanup();
//         resolve(res);
//       };
//       const wrappedReject = (err: any) => {
//         cleanup();
//         reject(err);
//       };
//     });
//   }

//   private isNetworkError(err: any) {
//     if (!err) return false;
//     const msg = (err && err.message) || '';
//     const code = err.code || '';
//     const networkCodes = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENETUNREACH', 'EHOSTUNREACH', 'EAI_AGAIN'];
//     return networkCodes.includes(String(code)) || /timeout|ETIMEDOUT|ENETUNREACH/i.test(msg);
//   }

//   // Create a time-limited private download URL and set filename for attachment
//   async createPrivateDownloadUrl(publicId: string, filename = 'receipt.pdf', expiresSeconds = 3600) {
//     const safeFilename = this.sanitizeFilename(filename); // implement same sanitize as VoucherService
//     const expiresAt = Math.floor(Date.now() / 1000) + expiresSeconds;

//     // use cloudinary utils private_download_url and pass attachment
//     const url = cloudinary.utils.private_download_url(publicId, 'pdf', {
//       resource_type: 'raw',
//       type: 'private',
//       expires_at: expiresAt,
//       attachment: safeFilename as any, // Cloudinary will set Content-Disposition
//     });

//     return url;
//   }

//   // High level: generate -> upload -> save booking fields -> return url+meta
//   async prepareReceiptAndGetUrl(booking: any | string, expiresSeconds = 3600) {
//     // allow callers to pass booking id or booking object
//     let bookingObj: any = booking;

//     // if they passed an id string, load booking with destination
//     if (typeof booking === 'string') {
//       bookingObj = await this.prisma.booking.findUnique({
//         where: { id: booking },
//         include: {
//           destination: { select: { title: true, region: true, country: true } },
//           receipt: true,
//           voucher: true,
//         },
//       });
//       if (!bookingObj) {
//         throw new Error(`Booking not found: ${booking}`);
//       }
//     }

//     // if destination is missing or doesn't have a title, load it
//     if (!bookingObj?.destination || !bookingObj.destination?.title) {
//       const fresh = await this.prisma.booking.findUnique({
//         where: { id: bookingObj.id },
//         include: {
//           destination: { select: { title: true, region: true, country: true } },
//           receipt: true,
//           voucher: true,
//         },
//       });
//       if (fresh) bookingObj = fresh;
//       // if fresh is null we keep bookingObj as-is (caller passed minimal info)
//     }

//     const ref = bookingObj.reference ?? `BK-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
//     const filename = `Inkaulele-Receipt-${ref}.pdf`;
//     const publicId = `receipts/${bookingObj.id}/${ref}.pdf`;

//     // generate pdf buffer using the resolved booking object
//     const pdfBuf = await this.generatePdfBuffer({ __htmlOverride: this.buildReceiptHtml(bookingObj) });

//     // upload to Cloudinary with retries
//     await this.uploadPdfToCloudinary(pdfBuf, publicId);

//     // create Receipt row (idempotent-ish)
//     try {
//       await this.prisma.receipt.upsert({
//         where: { bookingId: bookingObj.id },
//         update: {
//           publicId,
//           filename,
//           uploadedAt: new Date(),
//         },
//         create: {
//           bookingId: bookingObj.id,
//           publicId,
//           filename,
//           uploadedAt: new Date(),
//         },
//       });
//     } catch (err) {
//       this.logger.warn('Failed to persist receipt record', err);
//     }

//     const url = await this.createPrivateDownloadUrl(publicId, filename, expiresSeconds);
//     return { url, publicId, filename, buffer: pdfBuf };
//   }

//   private sanitizeFilename(name: string) {
//     const base = path.basename(name || 'voucher.pdf');
//     return base.replace(/[^\w\s.\-()_,]/g, '_');
//   }
// }

// /* helpers (escape functions inside same file) */
// function escapeHtml(s: any) {
//   return String(s ?? '')
//     .replace(/&/g, '&amp;')
//     .replace(/</g, '&lt;')
//     .replace(/>/g, '&gt;')
//     .replace(/"/g, '&quot;');
// }
// function escapeCss(s: any) {
//   return String(s ?? '').replace(/"/g, '\\"');
// }
// export function formatDate(iso?: string | Date): string {
//   if (!iso) return '—';
//   try {
//     const d = iso instanceof Date ? iso : new Date(iso);
//     return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
//   } catch {
//     return typeof iso === 'string' ? iso : iso.toString();
//   }
// }

// function sanitizeFilename(name: string) {
//   // strip path components and unsafe chars
//   const base = path.basename(name || 'receipt.pdf');
//   return base.replace(/[^\w\s.\-()_,]/g, '_'); // allow letters, numbers, ., -, _, ()
// }
// src/modules/receipt/receipt.service.ts
import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import * as puppeteer from 'puppeteer';
import * as crypto from 'crypto';
import streamifier from 'streamifier';
import { PrismaService } from '../../../prisma/prisma.service';
import path from 'path';
import dns from 'dns';
import https from 'https';

@Injectable()
export class ReceiptService {
  private readonly logger = new Logger(ReceiptService.name);

  // Upload retry settings
  private readonly uploadRetries = 3;
  private readonly baseBackoffMs = 700; // exponential backoff base
  private readonly perAttemptTimeoutMs = 30_000; // abort an upload attempt after this

  constructor(private prisma: PrismaService) {
    // Prefer IPv4 if the runtime supports ordering (helps when infra doesn't have IPv6)
    if (typeof dns.setDefaultResultOrder === 'function') {
      try {
        dns.setDefaultResultOrder('ipv4first');
        this.logger.debug('DNS result order set to ipv4first');
      } catch (e) {
        this.logger.warn('Could not set DNS default result order', e);
      }
    }

    // Force global https agent to prefer IPv4 and keepalive for connection reuse.
    // This affects modules using node's https (Cloudinary SDK uses https under the hood).
    https.globalAgent = new https.Agent({
      keepAlive: true,
      family: 4,
      timeout: 30_000,
      maxSockets: 50,
    });

    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET, // NEVER expose this to clients
      secure: true,
    });
  }

  /**
   * Render HTML (or booking object) to PDF buffer using Puppeteer.
   * Accepts:
   *  - raw HTML string
   *  - object with __htmlOverride
   *  - booking object (fallback -> buildReceiptHtml)
   */
  async generatePdfBuffer(input: any): Promise<Buffer> {
    try {
      let html: string;
      if (typeof input === 'string') {
        html = input;
      } else if (input && typeof input === 'object' && input.__htmlOverride) {
        html = input.__htmlOverride;
      } else {
        html = this.buildReceiptHtml(input);
      }

      const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const page = await browser.newPage();

      await page.setViewport({ width: 1200, height: 1400 });
      await page.emulateMediaType('screen');
      await page.setContent(html, {
        waitUntil: 'load',
        timeout: 0,
      });

      const pdfBuffer = await page.pdf({
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' },
      });

      await browser.close();
      return Buffer.from(pdfBuffer);
    } catch (err) {
      this.logger.error('PDF generation failed', err);
      throw new InternalServerErrorException('Failed to generate PDF');
    }
  }

  private buildReceiptHtml(booking: any) {
    const ref = booking.reference ?? `BK-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const email = booking.travelerEmail ?? '';
    const createdAt = new Date(booking.createdAt ?? Date.now());
    const datePretty = createdAt.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const logo =
      process.env.RECEIPT_LOGO_URL ??
      'https://res.cloudinary.com/dahrcnjfh/image/upload/v1759849979/inkaulele-transparent-logo.png';
    const firm = process.env.SITE_TITLE ?? 'Inkaulele Sidan';
    const poweredBy = process.env.POWERED_BY ?? 'Infineat Software';
    const currency = (booking.currency ?? 'KES').toUpperCase();
    const total = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: booking.currency ?? 'KES',
      minimumFractionDigits: 2,
    }).format(Number(booking.totalPrice ?? 0));
    const nights = booking.nights ?? 0;
    const guests = (booking.adults ?? 0) + (booking.children ?? 0);
    const dest =
      booking.destination?.title ?? (booking.destinationId ? String(booking.destinationId) : '—');
    const destRegion = booking.destination?.region ?? booking.destination?.country ?? '—';

    const COLORS = {
      teal: '#0f766e',
      charcoal: '#0b1220',
      gold: '#D6A34B',
      red: '#9B0302',
      muted: '#6b7280',
      bg: '#ffffff', // white sheet
    };

    const watermarkSvg = encodeURIComponent(`
  <svg xmlns='http://www.w3.org/2000/svg' width='400' height='200'>
    <defs>
      <pattern id='tile' patternUnits='userSpaceOnUse' width='400' height='200'>
        <text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle'
          font-family='system-ui, -apple-system, "Segoe UI", Roboto, Arial'
          font-size='28' font-weight='700'
          fill='rgba(11,18,32,0.045)' transform='rotate(-30 200 100)'>
          ${escapeHtml(firm)} • ${escapeHtml(ref)}
        </text>
      </pattern>
    </defs>
    <rect width='100%' height='100%' fill='url(#tile)' />
  </svg>
  `);

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Receipt — ${escapeHtml(ref)}</title>
<style>
  @page { size: A4; margin: 0; }
  html,body { margin:0; padding:0; height:100%; background:#f3f4f6; font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color:${COLORS.charcoal}; -webkit-font-smoothing:antialiased; }

  .sheet {
    width: 210mm;
    height: 297mm;
    box-sizing: border-box;
    margin: 0 auto;
    padding: 18mm;
    background: ${COLORS.bg};
    position: relative;
    overflow: hidden;
  }

  .watermark {
    position: absolute;
    inset: 0;
    opacity: 0.08;
    pointer-events: none;
    background-image: url('data:image/svg+xml;utf8,${watermarkSvg}');
    background-repeat: repeat;
    background-position: center;
    background-size: 400px 200px;
    z-index: 0;
  }

  header { display:flex; justify-content:space-between; align-items:center; gap:12mm; padding-bottom:6mm; border-bottom:1px solid rgba(11,18,32,0.06); z-index:1; }
  .brand { display:flex; align-items:center; gap:10px; min-width:0; }
  .brand img { height:42px; width:auto; border-radius:6px; }
  .brand .name { font-weight:800; font-size:16px; color:${COLORS.charcoal}; line-height:1; }
  .meta { text-align:right; font-size:12px; color:${COLORS.muted}; min-width:0; }
  .meta .ref { display:block; margin-top:6px; font-family: monospace; font-weight:700; color:${COLORS.teal}; }

  main { display:grid; grid-template-columns: 1fr 72mm; gap:10mm; margin-top:8mm; align-items:start; z-index:1; }

  .panel { background: linear-gradient(180deg,#fff,#fff); border-radius:16px; padding:12px; border:1px solid rgba(11,18,32,0.04); box-sizing:border-box; display:flex; flex-direction:column; min-height:140px; position:relative; }
.panel-help {
  display: flex;
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: 20px;
  min-height: 100px;
  border: 1px dashed rgba(11,18,32,0.08);
  background: #fafafa;
  border-radius: 12px;
}
  /* HERO band (destination) inside panel */
.hero-wrap {
  border-radius: 12px;
  padding: 12px 14px;
  background: linear-gradient(180deg, #f9fafb 0%, #ffffff 100%);
  border: 1px solid #eef2f6;
  box-shadow: 0 1px 2px rgba(0,0,0,0.03);
}

  .hero-wrap .dest-title {
    font-size: 18px;
    font-weight: 900;
    line-height: 1.05;
    margin: 0;
    letter-spacing: -0.01em;
  color: ${COLORS.charcoal};
  }
  .hero-wrap .dest-sub {
    font-size: 12px;

    margin-top: 4px;
    color: #6b7280;
  }

  /* compact meta row under hero */
  .meta-row {
    display:flex;
    gap:18px;
    align-items:center;
    margin-top:10px;
    flex-wrap:wrap;
  }
  .meta-row .k { font-size:12px; color:${COLORS.muted}; margin:0; }
  .meta-row .v { font-weight:700; font-size:13px; color:${COLORS.charcoal}; margin-top:4px; }

  .two-cols { display:flex; gap:12px; margin-top:12px; }
  .k { font-size:12px; color:${COLORS.muted}; }
  .v { font-weight:700; font-size:13px; color:${COLORS.charcoal}; }

  .items { margin-top:10px; border-top:1px dashed rgba(11,18,32,0.06); padding-top:10px; }
  .item { display:flex; justify-content:space-between; padding:8px 0; font-size:13px; border-bottom:1px solid rgba(11,18,32,0.02); }
  .item .label { color:${COLORS.charcoal}; }
  .item .value { font-weight:700; }

  /* nights pinned at bottom of panel */
  .panel-bottom {
    margin-top:12px;
    display:flex;
    justify-content:space-between;
    align-items:flex-end;
    margin-top:auto; /* push to bottom when panel grows */
  }
  .nights { font-size:12px; color:${COLORS.muted}; font-weight:700; }

  aside { display:flex; flex-direction:column; gap:9mm; align-items:stretch; }
  /* updated aside summary: stronger gradient band */
  .summary {
 background: #f9fafb;
    border-radius:12px;
    padding:14px;
    border:1px solid rgba(11,18,32,0.06);
    text-align:center;
color: #111827;
   box-shadow: 0 2px 8px rgba(0,0,0,0.04);
  }
  .summary .label { font-size:12px; opacity:0.95;   color: #6b7280; }
  .summary .amount { font-size:22px; font-weight:900; margin-top:8px;  color: #9B0302; }
  .summary .qr { display:flex; gap:8px; align-items:center; justify-content:center; margin-top:10px; }
  .summary .qr img { width:90px; height:90px; border-radius:8px; border: 1px solid rgba(0,0,0,0.06); padding:6px;  background: white;; }

  .ref-card { background:#fff; border-radius:8px; padding:10px; border:1px solid rgba(11,18,32,0.04); text-align:center; font-family:monospace; font-weight:700; color:${COLORS.charcoal}; }

footer {
  margin-top: 12mm;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: ${COLORS.muted};
  padding-top: 6mm;
  border-top: 1px solid rgba(11,18,32,0.06);
  gap: 8mm;
}
footer .notes {
  flex: 1;
  max-width: 75%; /* prevents overflowing into the powered section */
  line-height: 1.4;
}

footer div:last-child {
  white-space: nowrap; /* ✅ prevents wrapping into two lines */
  text-align: right;
  flex-shrink: 0; /* ✅ keeps it from shrinking */
}


  .sheet, header, main, footer, .panel, aside { page-break-inside: avoid; }
  .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  @media print {
    .sheet { box-shadow:none; margin:0; width:210mm; height:297mm; }
    .watermark { opacity:0.06; top: 60mm; }
  }
</style>
</head>
<body>
  <div class="sheet" role="document">
    <div class="watermark" aria-hidden="true"></div>

    <header>
      <div class="brand">
        <img src="${escapeHtml(logo)}" alt="${escapeHtml(firm)} logo" />
        <div>
          <div class="name">${escapeHtml(firm)}</div>
          <div class="muted" style="font-size:12px">Official booking receipt</div>
        </div>
      </div>

      <div class="meta">
        <div>${escapeHtml(datePretty)}</div>
        <div class="ref">Ref: ${escapeHtml(ref)}</div>
        <div class="truncate" style="max-width:80mm">${escapeHtml(email)}</div>
      </div>
    </header>

    <main>
      <!-- LEFT: details -->
      <div>
        <div class="panel" aria-labelledby="booking-details">
          <!-- HERO band -->
          <div class="hero-wrap" role="region" aria-label="destination">
            <div class="dest-title">${escapeHtml(dest)}</div>
            <div class="dest-sub">${escapeHtml(destRegion)}</div>
          </div>

          <!-- compact meta row: dates, traveler, guests (inline) -->
          <div class="meta-row" role="group" aria-label="booking-meta">
            <div>
              <div class="k">Dates</div>
              <div class="v">${escapeHtml(formatDate(booking.fromDate))} <span style="font-weight:normal">to</span> ${escapeHtml(formatDate(booking.toDate))}</div>
            </div>

            <div>
              <div class="k">Traveler</div>
              <div class="v" style="margin-top:6px">${escapeHtml(booking.travelerName ?? '—')}</div>
            </div>

            <div>
              <div class="k">Guests</div>
              <div class="v" style="margin-top:6px">${guests}</div>
            </div>
            
            <div>
              <div class="k">Duration</div>
              <div class="v" style="margin-top:6px">${nights} night${nights !== 1 ? 's' : ''}</div>
            </div>
          </div>

          <!-- line items -->
          <div class="items" aria-label="line items">
            ${(booking.breakdown && typeof booking.breakdown === 'object')
              ? Object.entries(booking.breakdown).map(([k, v]: any) => `<div class="item"><div class="label">${escapeHtml(k)}</div><div class="value">${escapeHtml(String(v))}</div></div>`).join('')
              : `<div class="item"><div class="label">All Inclusive</div><div class="value">${escapeHtml(total)}</div></div>`
            }
          </div>
        </div>
        <div style="height:10mm"></div>
             
<!-- small help panel -->
<div class="panel-help">
  <div>
    <div style="font-weight:800; font-size:14px;">Need help?</div>
    <div class="k" style="margin-top:6px; font-size:12px;">
      Email <a href="mailto:support@inkaulele.com" 
        style="color:${COLORS.teal}; text-decoration:none; font-weight:600;">
        support@inkaulele.com
      </a>
    </div>
  </div>
</div>

      </div>

      <!-- RIGHT: summary -->
      <aside>
        <div class="summary" role="complementary" aria-label="payment summary">
          <div class="label">Total paid</div>
          <div class="amount">${escapeHtml(total)}</div>
          <div class="qr">
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(booking.voucherUrl ?? ref)}" alt="QR code" />
          </div>
           <div style="font-size:11px;color:${COLORS.muted};margin-top:6px">
            Used by our partners to verify your booking.
          </div>
        </div>

        <div class="ref-card">
          ${escapeHtml(ref)}
          <div style="font-size:11px;color:${COLORS.muted};margin-top:6px">Keep for check-in</div>
        </div>
      </aside>
    </main>

    <footer>
<div class="notes">
  We're delighted to have you traveling with ${escapeHtml(firm)}! This receipt serves as proof of payment at check-in.
</div>

      <div style="font-size:12px;color:${COLORS.muted}">Powered by ${escapeHtml(poweredBy)}</div>
    </footer>
  </div>
</body>
</html>`;
  }

  // Upload buffer to Cloudinary as raw/private and return result
  async uploadPdfToCloudinary(buffer: Buffer, publicId: string) {
    // wrapper that attempts multiple times with backoff
    let attempt = 0;
    let lastErr: any = null;

    while (attempt < this.uploadRetries) {
      attempt += 1;
      const attemptLabel = `Cloudinary upload attempt ${attempt}/${this.uploadRetries} (publicId=${publicId})`;
      this.logger.debug(attemptLabel);

      try {
        const result = await this.performUploadOnce(buffer, publicId, this.perAttemptTimeoutMs);
        this.logger.debug(`${attemptLabel} succeeded`);
        return result;
      } catch (err: any) {
        lastErr = err;
        // detect network-ish errors to decide whether to retry
        const code = err && (err.code || (err[0] && err[0].code));
        const isNetworkError = this.isNetworkError(err) || code === 'ETIMEDOUT' || code === 'ENETUNREACH';

        this.logger.warn(`${attemptLabel} failed`, { attempt, code: code ?? err?.name ?? 'unknown', message: err?.message ?? String(err) });

        if (attempt >= this.uploadRetries || !isNetworkError) {
          // no more retries or non-network error -> throw
          this.logger.error('Cloudinary upload: no more retries or non-retryable error', err);
          throw err;
        }

        // backoff before retry
        const backoff = this.baseBackoffMs * Math.pow(2, attempt - 1);
        this.logger.debug(`Waiting ${backoff}ms before next upload attempt`);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }

    // if we exit loop without return
    this.logger.error('Cloudinary upload failed after retries', lastErr);
    throw lastErr ?? new Error('Cloudinary upload failed');
  }

  // single attempt upload (one try) - returns Promise that resolves or rejects
  private performUploadOnce(buffer: Buffer, publicId: string, timeoutMs: number) {
    return new Promise<any>((resolve, reject) => {
      let finished = false;
      const onDone = (err: any, res?: any) => {
        if (finished) return;
        finished = true;
        if (err) return reject(err);
        resolve(res);
      };

      // create upload_stream
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'raw',
          type: 'private',
          public_id: publicId,
          overwrite: true,
          use_filename: false,
        },
        onDone,
      );

      // pipe buffer to stream
      try {
        const read = streamifier.createReadStream(buffer);
        read.pipe(uploadStream);
      } catch (e) {
        return reject(e);
      }

      // guard with timeout for the attempt
      const to = setTimeout(() => {
        if (finished) return;
        finished = true;
        // attempt to destroy stream (best-effort)
        try {
          uploadStream.destroy(new Error('upload attempt timed out'));
        } catch (_) {
          // ignore
        }
        reject(Object.assign(new Error('Cloudinary upload attempt timed out'), { code: 'ETIMEDOUT' }));
      }, timeoutMs);

      // cleanup when finished
      const cleanup = () => clearTimeout(to);
      // wrap resolution to cleanup timer
      const wrappedResolve = (res: any) => {
        cleanup();
        resolve(res);
      };
      const wrappedReject = (err: any) => {
        cleanup();
        reject(err);
      };
    });
  }

  private isNetworkError(err: any) {
    if (!err) return false;
    const msg = (err && err.message) || '';
    const code = err.code || '';
    const networkCodes = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENETUNREACH', 'EHOSTUNREACH', 'EAI_AGAIN'];
    return networkCodes.includes(String(code)) || /timeout|ETIMEDOUT|ENETUNREACH/i.test(msg);
  }

  // Create a time-limited private download URL and set filename for attachment
  async createPrivateDownloadUrl(publicId: string, filename = 'receipt.pdf', expiresSeconds = 3600) {
    const safeFilename = this.sanitizeFilename(filename); // implement same sanitize as VoucherService
    const expiresAt = Math.floor(Date.now() / 1000) + expiresSeconds;

    // use cloudinary utils private_download_url and pass attachment
    const url = cloudinary.utils.private_download_url(publicId, 'pdf', {
      resource_type: 'raw',
      type: 'private',
      expires_at: expiresAt,
      attachment: safeFilename as any, // Cloudinary will set Content-Disposition
    });

    return url;
  }

  // High level: generate -> upload -> save booking fields -> return url+meta
  async prepareReceiptAndGetUrl(booking: any | string, expiresSeconds = 3600) {
    // allow callers to pass booking id or booking object
    let bookingObj: any = booking;

    // if they passed an id string, load booking with destination
    if (typeof booking === 'string') {
      bookingObj = await this.prisma.booking.findUnique({
        where: { id: booking },
        include: {
          destination: { select: { title: true, region: true, country: true } },
          receipt: true,
          voucher: true,
        },
      });
      if (!bookingObj) {
        throw new Error(`Booking not found: ${booking}`);
      }
    }

    // if destination is missing or doesn't have a title, load it
    if (!bookingObj?.destination || !bookingObj.destination?.title) {
      const fresh = await this.prisma.booking.findUnique({
        where: { id: bookingObj.id },
        include: {
          destination: { select: { title: true, region: true, country: true } },
          receipt: true,
          voucher: true,
        },
      });
      if (fresh) bookingObj = fresh;
      // if fresh is null we keep bookingObj as-is (caller passed minimal info)
    }

    const ref = bookingObj.reference ?? `BK-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const filename = `Inkaulele-Receipt-${ref}.pdf`;
    const publicId = `receipts/${bookingObj.id}/${ref}.pdf`;

    // generate pdf buffer using the resolved booking object
    const pdfBuf = await this.generatePdfBuffer({ __htmlOverride: this.buildReceiptHtml(bookingObj) });

    // upload to Cloudinary with retries
    await this.uploadPdfToCloudinary(pdfBuf, publicId);

    // create Receipt row (idempotent-ish)
    try {
      await this.prisma.receipt.upsert({
        where: { bookingId: bookingObj.id },
        update: {
          publicId,
          filename,
          uploadedAt: new Date(),
        },
        create: {
          bookingId: bookingObj.id,
          publicId,
          filename,
          uploadedAt: new Date(),
        },
      });
    } catch (err) {
      this.logger.warn('Failed to persist receipt record', err);
    }

    const url = await this.createPrivateDownloadUrl(publicId, filename, expiresSeconds);
    return { url, publicId, filename, buffer: pdfBuf };
  }

  private sanitizeFilename(name: string) {
    const base = path.basename(name || 'voucher.pdf');
    return base.replace(/[^\w\s.\-()_,]/g, '_');
  }
}

/* helpers (escape functions inside same file) */
function escapeHtml(s: any) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function escapeCss(s: any) {
  return String(s ?? '').replace(/"/g, '\\"');
}
export function formatDate(iso?: string | Date): string {
  if (!iso) return '—';
  try {
    const d = iso instanceof Date ? iso : new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return typeof iso === 'string' ? iso : iso.toString();
  }
}

function sanitizeFilename(name: string) {
  // strip path components and unsafe chars
  const base = path.basename(name || 'receipt.pdf');
  return base.replace(/[^\w\s.\-()_,]/g, '_'); // allow letters, numbers, ., -, _, ()
}
