// src/modules/bookings/bookings.module.ts
import { Module } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { BookingVoucherController } from './booking.voucher.controller';
import { BookingQueryController } from './booking.query.controller';
import { ReceiptModule } from '../receipt/receipt.module';
import { MailerModule } from '../mailer/mailer.module';
import { VoucherModule } from '../voucher/voucher.module';
import { FilesController } from '../files/files.controller';
import { BookingConfirmationService } from './booking-confirmation.service';
import { BookingReceiptController } from './booking.receipt.controller';
import { AdminBookingController } from './booking.admin.controller';
import { VerifyVoucherController } from './verify-voucher.controller';
import { BookingInquiryModule } from '../booking-inquiry/booking.inquiry.module';



@Module({
  imports: [ReceiptModule, MailerModule, VoucherModule, BookingInquiryModule],
  controllers: [BookingVoucherController, BookingQueryController, FilesController, BookingReceiptController, AdminBookingController,VerifyVoucherController],
  providers: [PrismaService, BookingConfirmationService], // << include the service
  exports: [BookingConfirmationService], // export if other modules need it
})
export class BookingsModule {}
