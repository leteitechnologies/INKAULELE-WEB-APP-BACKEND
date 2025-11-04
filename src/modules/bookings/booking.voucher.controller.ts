import {
  Controller,
  Get,
  Post,
  Param,
  Req,
  Res,
  Query,
  NotFoundException,
  ForbiddenException,
  Logger,
  BadRequestException,
  Body,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ReceiptService } from '../receipt/receipt.service';
import { MailerService } from '../mailer/mailer.service';
import { VoucherService } from '../voucher/voucher.service';

@Controller('bookings')
export class BookingVoucherController {
  private readonly logger = new Logger(BookingVoucherController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly receiptService: ReceiptService,
    private readonly voucherService: VoucherService,
    private readonly mailer: MailerService,
  ) {}

  /**
   * GET /bookings/:id/voucher
   * Redirects client to a short-lived private voucher URL.
   */

@Get(':id/voucher')
async getVoucher(
  @Param('id') id: string,
  @Req() req: any,
  @Res() res: any,
  @Query('session_id') sessionId?: string,
) {
  const booking = await this.prisma.booking.findUnique({
    where: { id },
    include: { destination: true, voucher: true, receipt: true },
  });
  if (!booking) throw new NotFoundException('Booking not found');

  const user = req.user;
  const allowedBySession = !!(
    sessionId &&
    booking.stripeCheckoutSessionId &&
    sessionId === booking.stripeCheckoutSessionId
  );
  if (!user && !allowedBySession) throw new ForbiddenException('Authentication required');

  if (user) {
    const isAdmin = user.role === 'ADMIN';
    if (!isAdmin && user.email !== booking.travelerEmail) {
      throw new ForbiddenException('You do not have access to this voucher');
    }
  }

  // If voucher already exists -> return short-lived voucher url
  if (booking.voucher?.publicId) {
    const filename =
      booking.voucher.filename ?? `Inkaulele-Voucher-${booking.reference ?? booking.id}.pdf`;
    const url = await this.voucherService.createPrivateDownloadUrl(
      booking.voucher.publicId,
      filename,
      60 * 60,
    );
    return res.redirect(url);
  }

  // IMPORTANT: do NOT auto-create voucher here.
  return res.status(404).json({
    error: 'voucher_not_generated',
    message: 'Voucher not generated yet. Generate it from the admin dashboard (POST /bookings/:id/voucher).',
  });
}

  /**
   * POST /bookings/:id/voucher
   * Generate voucher (idempotent), email it, and return the URL.
   */
@Post(':id/voucher')
async createAndEmailVoucher(
  @Param('id') id: string,
  @Req() req: any,
  @Body() body: { force?: boolean; expiresSeconds?: number; session_id?: string; sendEmail?: boolean },
) {
  const { force = false, expiresSeconds = 60 * 60 * 2, session_id, sendEmail = false } = body ?? {};

  const booking = await this.prisma.booking.findUnique({
    where: { id },
    include: { destination: true, durationOption: true, voucher: true, receipt: true },
  });
  if (!booking) throw new NotFoundException('Booking not found');

  // Authorization
  const user = req.user;
  const allowedBySession = !!(session_id && booking.stripeCheckoutSessionId && session_id === booking.stripeCheckoutSessionId);
  if (!user && !allowedBySession) throw new ForbiddenException('Authentication required');
  if (user) {
    const isAdmin = user.role === 'ADMIN';
    if (!isAdmin && user.email !== booking.travelerEmail) {
      throw new ForbiddenException('You do not have permission to generate this voucher');
    }
  }

  // Idempotency: voucher exists and not forcing -> return url + meta
  if (booking.voucher?.publicId && !force) {
    this.logger.log(`Voucher already generated for booking ${id} (publicId=${booking.voucher.publicId})`);
    const filename =
      booking.voucher.filename ?? `Inkaulele-Voucher-${booking.reference ?? booking.id}.pdf`;
    const url = await this.voucherService.createPrivateDownloadUrl(booking.voucher.publicId, filename, expiresSeconds);
    return { url, note: 'already_generated', expiresInSeconds: expiresSeconds, emailedAt: booking.voucher.emailedAt ?? null };
  }

  // Generate (and upload) voucher
  try {
    const { url, publicId, filename, buffer } = await this.voucherService.prepareVoucherAndGetUrl(
      booking,
      expiresSeconds,
    );

    // Update voucher record (uploadedAt set inside prepareVoucherAndGetUrl but ensure record exists)
    try {
      await this.prisma.voucher.upsert({
        where: { bookingId: booking.id },
        update: { publicId, filename, uploadedAt: new Date() },
        create: { bookingId: booking.id, publicId, filename, uploadedAt: new Date() },
      });
    } catch (err) {
      this.logger.warn('Failed to persist voucher record after generation', err);
    }

    // ONLY send email if explicitly requested by caller (admin)
    const to = booking.travelerEmail ?? undefined;
    if (sendEmail) {
      if (!to) {
        this.logger.warn(`Booking ${id} has no travelerEmail; skipping voucher email send`);
      } else {
        await this.mailer.sendVoucherEmail({
          to,
          booking: { ...booking, voucherUrl: url },
          voucherPdf: buffer,
          filename,
          bccAdmin: true,
        });

        try {
          await this.prisma.voucher.update({
            where: { bookingId: booking.id },
            data: { emailedAt: new Date() },
          });
        } catch (err) {
          this.logger.warn('Failed to mark voucher emailedAt', err);
        }
      }
    } else {
      this.logger.log(`Voucher generated for booking ${id} (not emailed because sendEmail=false)`);
    }

    return { url, expiresInSeconds: expiresSeconds, publicId, emailed: Boolean(sendEmail) };
  } catch (err) {
    this.logger.error('Failed to create voucher', err);
    throw new BadRequestException('Failed to generate voucher');
  }
}

}
