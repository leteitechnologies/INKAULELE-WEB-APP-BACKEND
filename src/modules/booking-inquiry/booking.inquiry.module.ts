// src/modules/booking/booking.module.ts
import { Module } from '@nestjs/common';

import { PrismaService } from '../../../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { BookingCommandController } from '../bookings/booking.command.controller';
import { BookingInquiryService } from './booking.inquiry.service';
import { AdminInquiryBookingController } from './booking.enquiry.admin.controller';
import { BookingInquiryController } from './booking.inquiry.controller';

@Module({
  controllers: [BookingCommandController, AdminInquiryBookingController, BookingInquiryController],
  providers: [BookingInquiryService, PrismaService, MailerService],
})
export class BookingInquiryModule {}
