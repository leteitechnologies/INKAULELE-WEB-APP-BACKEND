// src/modules/bookings/booking-confirmation.service.ts
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { VoucherService } from '../voucher/voucher.service';
import { MailerService } from '../mailer/mailer.service';
import { retryWithBackoff } from '../../utils/retry';

@Injectable()
export class BookingConfirmationService {
  private readonly logger = new Logger(BookingConfirmationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly voucherService: VoucherService,
    private readonly mailer: MailerService,
  ) {}

  /**
   * Confirm booking (idempotent). This:
   *  - marks booking CONFIRMED
   *  - ensures receipt (if desired) and voucher for traveler
   *  - creates supplier voucher(s) and emails suppliers (if configured)
   *
   * options:
   *  - notifySupplier: boolean (default: true)
   *  - emailTraveler: boolean (default: true)
   *  - forceRegenerate: boolean (default: false) -> force regen voucher(s)
   */
  async confirmBooking(
    bookingId: string,
    opts?: { notifySupplier?: boolean; emailTraveler?: boolean; forceRegenerate?: boolean },
  ) {
    const { notifySupplier = true, emailTraveler = true, forceRegenerate = false } = opts ?? {};

    // load booking + relations
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        destination: true,
        durationOption: true,
        voucher: true,
        receipt: true,
        accommodationSupplier: true,
        supplierVouchers: true,
      },
    });

    if (!booking) throw new BadRequestException('Booking not found');

    // If already confirmed and not forcing -> return existing metadata
    if (booking.status === 'CONFIRMED' && !forceRegenerate) {
      this.logger.log(`Booking ${bookingId} is already CONFIRMED. Returning existing artifacts.`);
    } else {
      // Mark confirmed (idempotent-ish)
      try {
        await this.prisma.booking.update({
          where: { id: bookingId },
          data: { status: 'CONFIRMED' },
        });
        this.logger.log(`Booking ${bookingId} marked CONFIRMED`);
      } catch (err) {
        this.logger.warn(`Failed to update booking status for ${bookingId}`, err);
      }
    }

    // REFRESH booking after possible update
    const fullBooking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        destination: true,
        durationOption: true,
        voucher: true,
        receipt: true,
        accommodationSupplier: true,
        supplierVouchers: true,
      },
    });

    if (!fullBooking) throw new BadRequestException('Booking not found after update');

    const to = fullBooking.travelerEmail ?? undefined;
    const voucherTtl = 24 * 3600; // 24 hours short-lived url by default

    // -- Ensure voucher (traveler) --
    let travelerVoucher: { url?: string; publicId?: string; filename?: string; buffer?: Buffer } | null = null;
    try {
      // If voucher exists and not forcing regen -> just create short lived url
      if (fullBooking.voucher?.publicId && !forceRegenerate) {
        const vf = fullBooking.voucher.filename ?? `Inkaulele-Voucher-${fullBooking.reference ?? fullBooking.id}.pdf`;
        const vurl = await retryWithBackoff(
          () => this.voucherService.createPrivateDownloadUrl(fullBooking.voucher!.publicId, vf, voucherTtl),
          3, 600, 2
        );
        travelerVoucher = { url: vurl, publicId: fullBooking.voucher.publicId, filename: vf };
        this.logger.log(`Reused existing voucher for booking ${bookingId}`);
      } else {
        // generate & upload (voucherService does upsert into Voucher table)
        const created = await retryWithBackoff(
          () => this.voucherService.prepareVoucherAndGetUrl(fullBooking, voucherTtl),
          4, 800, 2
        );
        travelerVoucher = created;
        this.logger.log(`Generated new voucher for booking ${bookingId} (publicId=${created.publicId})`);
      }
    } catch (err) {
      this.logger.warn(`Failed to ensure traveler voucher for booking ${bookingId}:`, err);
      // continue — voucher failure shouldn't block supplier notifications; let caller decide
    }

    // -- Email traveler (if requested and email available) --
    if (emailTraveler && to && travelerVoucher) {
      try {
        await this.mailer.sendVoucherEmail({
          to,
          booking: { ...fullBooking, voucherUrl: travelerVoucher.url },
          voucherUrl: travelerVoucher.url,
          voucherPdf: travelerVoucher.buffer,
          filename: travelerVoucher.filename,
          bccAdmin: true,
        });
        // mark emailedAt (best-effort)
        await this.prisma.voucher.update({
          where: { bookingId: fullBooking.id },
          data: { emailedAt: new Date() },
        }).catch(() => {});
        this.logger.log(`Voucher email sent for booking ${bookingId} to ${to}`);
      } catch (err) {
        this.logger.warn(`Failed to email traveler voucher for booking ${bookingId}:`, err);
      }
    } else if (!to) {
      this.logger.warn(`Booking ${bookingId} has no traveler email; not emailing voucher.`);
    }

    // -- Supplier voucher(s) & notification --
    if (notifySupplier) {
      // Example: if there's a single accommodation supplier (accommodationSupplierId)
      const supplier = fullBooking.accommodationSupplier;
      if (supplier) {
        try {
          const supplierObj = {
            name: supplier.name,
            email: supplier.email ?? undefined,
            phone: supplier.phone ?? undefined,
            ref: undefined,
            type: supplier.type ?? undefined,
          };

          // Generate supplier voucher (voucherService persists SupplierVoucher record)
          const sv = await retryWithBackoff(
            () => this.voucherService.prepareSupplierVoucherAndGetUrl(fullBooking, supplierObj, voucherTtl),
            3, 800, 2
          );

          // Email supplier (best-effort)
          if (supplier.email) {
            await this.mailer.sendSupplierVoucherEmail({
              supplier: { name: supplier.name, phone: supplier.phone ?? undefined, email: supplier.email ?? undefined },
              booking: fullBooking,
              voucherUrl: sv.url,
            });

            // mark supplierVoucher emailedAt
            await this.prisma.supplierVoucher.updateMany({
              where: { bookingId: fullBooking.id, publicId: sv.publicId },
              data: { emailedAt: new Date() },
            }).catch(() => {});
            this.logger.log(`Supplier voucher emailed to ${supplier.email} for booking ${bookingId}`);
          } else {
            this.logger.warn(`Supplier for booking ${bookingId} has no email; skipping supplier email.`);
          }
        } catch (err) {
          this.logger.warn(`Failed to create/email supplier voucher for booking ${bookingId}`, err);
        }
      } else {
        // If you have many suppliers (transfers, activities), iterate here similarly
        this.logger.log(`No accommodationSupplier configured for booking ${bookingId}; skipping supplier voucher creation.`);
      }
    }

    return {
      bookingId: fullBooking.id,
      voucher: travelerVoucher ? { url: travelerVoucher.url, publicId: travelerVoucher.publicId } : null,
    };
  }
}
