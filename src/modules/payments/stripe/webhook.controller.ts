// src/modules/payments/webhook.controller.ts
import { Controller, Post, Req, Res, Headers, Logger } from '@nestjs/common';
import StripeService from './stripe.service';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ReceiptService } from '@app/modules/receipt/receipt.service';
import { MailerService } from '@app/modules/mailer/mailer.service';
import { VoucherService } from '@app/modules/voucher/voucher.service';
import { retryWithBackoff } from '@app/utils/retry';

@Controller('webhooks')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly stripeService: StripeService,
    private readonly prisma: PrismaService,
    private readonly receiptService: ReceiptService,
    private readonly voucherService: VoucherService,
    private readonly mailerService: MailerService,
  ) {}

  @Post('stripe')
  async handle(@Req() req: any, @Res() res: any, @Headers('stripe-signature') sig: string) {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      this.logger.error('Missing STRIPE_WEBHOOK_SECRET env var');
      return res.status(500).send('Webhook not configured');
    }

    // Obtain raw buffer (bodyParser.raw must be registered on /webhooks/stripe)
    let buf: Buffer | undefined;
    if (Buffer.isBuffer(req.body)) buf = req.body;
    else if (req.rawBody && Buffer.isBuffer(req.rawBody)) buf = req.rawBody;
    else if (typeof req.body === 'string' && req.body.length) buf = Buffer.from(req.body);

    if (!buf) {
      this.logger.error('No raw body buffer found on Stripe webhook request');
      return res.status(400).send('Webhook Error: no raw body available');
    }

    let event: any;
    try {
      event = this.stripeService.constructEvent(buf, sig, webhookSecret);
    } catch (err: any) {
      this.logger.error('Webhook signature verification failed', err);
      return res.status(400).send(`Webhook Error: ${err?.message ?? String(err)}`);
    }

    this.logger.log(`Stripe event received: ${event.type}`);

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as any;
          await this.processBookingAfterPayment(session.metadata?.bookingId, session);
          break;
        }
        case 'payment_intent.succeeded': {
          const pi = event.data.object as any;
          await this.processBookingAfterPayment(pi.metadata?.bookingId, pi);
          break;
        }
        default:
          this.logger.log(`Unhandled Stripe event type: ${event.type}`);
      }
    } catch (err) {
      this.logger.error('Error processing webhook event', err);
      return res.status(500).send('Webhook handler error');
    }

    return res.status(200).send({ received: true });
  }



private async processBookingAfterPayment(bookingId?: string | null, stripeObject?: any) {
  if (!bookingId) {
    this.logger.warn('Stripe event missing bookingId metadata — skipping');
    return;
  }

  this.logger.log(`Processing booking ${bookingId}`);

  const booking = await this.prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      destination: true,
      durationOption: true,
      receipt: true,
      voucher: true,
    },
  });

  if (!booking) {
    this.logger.warn(`Booking not found: ${bookingId}`);
    return;
  }

  // Idempotency checks
  const alreadyConfirmed = booking.status === 'CONFIRMED';
  const alreadyHasReceipt = !!booking.receipt?.publicId;
  // NOTE: we intentionally DO NOT auto-generate vouchers here.
  // const alreadyHasVoucher = !!booking.voucher?.publicId;

  // Mark confirmed (idempotent)
  if (!alreadyConfirmed) {
    await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: 'CONFIRMED',
        stripePaymentIntentStatus: stripeObject?.status ?? undefined,
      },
    });
    this.logger.log(`Booking ${bookingId} marked CONFIRMED`);
  } else {
    this.logger.log(`Booking ${bookingId} already CONFIRMED`);
  }

  const to = booking.travelerEmail ?? undefined;
  const receiptTtl = 24 * 3600;

  try {
    // If receipt exists
    if (alreadyHasReceipt) {
      this.logger.log(`Booking ${bookingId} already has a Receipt record; skipping receipt generation.`);

      // If receipt wasn't emailed, email it
      if (!booking.receipt?.emailedAt && to) {
        try {
          const rfilename = booking.receipt!.filename ?? `Inkaulele-Receipt-${booking.reference ?? booking.id}.pdf`;
          const rurl = await retryWithBackoff(
            () => this.receiptService.createPrivateDownloadUrl(booking.receipt!.publicId, rfilename, receiptTtl),
            3, 700, 2
          );

          // Send the receipt link/attachment via mailer
          await this.mailerService.sendReceiptEmail({
            to,
            travelerName: booking.travelerName ?? undefined,
            bookingRef: booking.reference ?? booking.id,
            pdfBuffer: undefined, // we don't have buffer here
            filename: rfilename,
            downloadUrl: rurl,
          });

          await this.prisma.receipt.update({
            where: { bookingId: booking.id },
            data: { emailedAt: new Date() },
          });

          this.logger.log(`Receipt email sent for booking ${bookingId}`);
        } catch (err) {
          this.logger.warn(`Failed to send existing receipt email for booking ${bookingId}:`, err);
        }
      }

      // IMPORTANT: intentionally NOT generating voucher or sending voucher email here.
      return;
    }

    // === No receipt yet: generate receipt, persist, email ===
    const { url, publicId, filename, buffer } = await retryWithBackoff(
      () => this.receiptService.prepareReceiptAndGetUrl(booking, receiptTtl),
      4,      // attempts
      800,    // initial delay ms
      2,      // backoff factor
      (err) => {
        // retry only network/timeouts and allow other errors to bubble
        const code = err?.code ?? err?.errno;
        return ['ETIMEDOUT', 'ENETUNREACH', 'ECONNRESET', 'EAI_AGAIN', 'ECONNREFUSED'].includes(String(code));
      }
    );

    // Persist receipt metadata (idempotent)
    await this.prisma.receipt.upsert({
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

    if (to) {
      // 1) Send receipt (attach pdf)
      await this.mailerService.sendReceiptEmail({
        to,
        travelerName: booking.travelerName ?? undefined,
        bookingRef: booking.reference ?? booking.id,
        pdfBuffer: buffer,
        filename,
        downloadUrl: url,
      });
      this.logger.log(`Receipt email (attached) sent for booking ${bookingId} to ${to}`);

      // NOTE: intentionally NOT generating voucher or sending voucher email here.
      // Voucher generation & emailing will be performed manually via admin endpoint.
    } else {
      this.logger.warn(`Booking ${bookingId} has no travelerEmail; cannot send receipt`);
    }
  } catch (err) {
    this.logger.error(`Failed to prepare/send receipt for booking ${bookingId}`, err);
  }
}

}

