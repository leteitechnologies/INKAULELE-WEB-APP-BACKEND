// src/modules/bookings/booking.receipt.controller.ts
import fetch from 'node-fetch'; 
import { Controller, Get, Param, Res, Query, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ReceiptService } from '../receipt/receipt.service';

@Controller('bookings')
export class BookingReceiptController {
  private readonly logger = new Logger(BookingReceiptController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly receiptService: ReceiptService,
  ) {}


@Get(':id/receipt')
async getReceipt(
  @Param('id') id: string,
  @Res() res: any,
  @Query('session_id') sessionId?: string,
) {
  const booking = await this.prisma.booking.findUnique({
    where: { id },
    include: {
      receipt: true,
      destination: { select: { title: true, region: true, country: true } },
    },
  });

  if (!booking) throw new NotFoundException('Booking not found');

  const allowedBySession = !!(
    sessionId &&
    booking.stripeCheckoutSessionId &&
    sessionId === booking.stripeCheckoutSessionId
  );
  if (!allowedBySession) throw new ForbiddenException('Authentication required');

  let url: string;
  let filename = `Inkaulele-Receipt-${booking.reference ?? booking.id}.pdf`;

  if (booking.receipt?.publicId) {
    const vf = booking.receipt.filename ?? filename;
    url = await this.receiptService.createPrivateDownloadUrl(booking.receipt.publicId, vf, 60 * 60);
    filename = vf;
  } else {
    const created = await this.receiptService.prepareReceiptAndGetUrl(booking, 60 * 60);
    url = created.url;
    filename = created.filename ?? filename;
  }

  // === Streaming fetch + pipe to response (forces Content-Disposition) ===
  try {
    const remoteResp = await fetch(url, { redirect: 'follow' });
    if (!remoteResp.ok) {
      this.logger.warn(`Failed to fetch remote receipt: ${remoteResp.status} ${remoteResp.statusText}`);
      return res.status(502).send('Failed to fetch receipt file');
    }

    // copy/override headers we want the client to receive
    const contentType = remoteResp.headers.get('content-type') || 'application/pdf';
    const contentLength = remoteResp.headers.get('content-length') || undefined;

    res.setHeader('Content-Type', contentType);
    if (contentLength) res.setHeader('Content-Length', contentLength);

    // Force the filename in Content-Disposition (UTF-8 safe)
    // Use filename* for utf-8 names; fallback to simple filename
    const safe = filename.replace(/["\\]/g, '').replace(/\s+/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(filename)}`);

    // Pipe remote body to response
    const body = remoteResp.body;
    if (!body) {
      return res.status(502).send('No response body from provider');
    }

    // node-fetch returns a Node Readable stream we can pipe
    body.pipe(res);

    // When piping, return after stream ends (optional)
    body.on('error', (err: any) => {
      this.logger.warn('Error streaming remote receipt:', err);
      try { res.end(); } catch {}
    });
  } catch (err) {
    this.logger.error('Error streaming receipt', err);
    return res.status(500).send('Internal error fetching receipt');
  }
}
}
