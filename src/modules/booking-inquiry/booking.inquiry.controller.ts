// booking.inquiry.controller.ts

import { Controller, Post, Body, HttpCode, HttpStatus, Logger, UsePipes, ValidationPipe, InternalServerErrorException } from '@nestjs/common';
import { CreateBookingEnquiryDto } from './dto/create-booking-enquiry.dto';
import { BookingInquiryService } from './booking.inquiry.service';

@Controller('booking-enquiry')
export class BookingInquiryController {
  private readonly logger = new Logger(BookingInquiryController.name);
  constructor(private readonly BookingInquiryService: BookingInquiryService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async create(@Body() dto: CreateBookingEnquiryDto) {
    this.logger.debug('booking-enquiry create', { preview: JSON.stringify(dto).slice(0, 300) });
    try {
      const result = await this.BookingInquiryService.createBookingEnquiry(dto);
      return {
        ok: true,
        id: result.record?.id,
        createdAt: result.record?.createdAt,
        adminSent: !!result.adminSent,
        hostSent: !!result.hostSent,
        hostEmail: result.hostEmail ?? null,
        // NEW: pass back short error messages (if any)
        adminError: result.adminError ?? null,
        hostError: result.hostError ?? null,
      };
    } catch (err) {
      this.logger.error('Failed to create booking enquiry', err as any);
      // fail loudly for unexpected exceptions (DB down etc)
      throw new InternalServerErrorException('Failed to create booking enquiry');
    }
  }
}
