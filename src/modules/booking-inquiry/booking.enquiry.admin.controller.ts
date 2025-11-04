// src/modules/booking/admin.controller.ts
import {
  Controller,
  Get,
  Param,
  Query,
  Post,
  Logger,
  UseGuards,
  NotFoundException,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { BookingInquiryService } from './booking.inquiry.service';
import { AdminApiKeyGuard } from '../contact/admin.guard'; // adjust path if your guard lives elsewhere

@Controller('admin/booking-enquiries')
@UseGuards(AdminApiKeyGuard)
export class AdminInquiryBookingController {
  private readonly logger = new Logger(AdminInquiryBookingController.name);

  constructor(private readonly bookingService: BookingInquiryService) {}

  // GET /admin/booking-enquiries?limit=200&unnotified=true
  @Get()
  async list(
    @Query('limit') limit?: string,
    @Query('unnotified') unnotified?: string,
  ) {
    let l: number | undefined;
    if (typeof limit === 'string' && limit.trim() !== '') {
      const n = Number(limit);
      if (Number.isNaN(n) || n <= 0) throw new BadRequestException('limit must be a positive integer');
      l = Math.trunc(n);
    }

    let unnotifiedBool: boolean | undefined;
    if (typeof unnotified === 'string') {
      if (unnotified === 'true') unnotifiedBool = true;
      else if (unnotified === 'false') unnotifiedBool = false;
      else throw new BadRequestException('unnotified must be "true" or "false"');
    }

    const rows = await this.bookingService.listBookingEnquiries({ limit: l, unnotified: unnotifiedBool });
    return { data: rows };
  }

  // GET /admin/booking-enquiries/:id
  @Get(':id')
  async getOne(@Param('id') id: string) {
    const rec = await this.bookingService.getBookingEnquiry(id);
    if (!rec) throw new NotFoundException('Booking enquiry not found');
    return rec;
  }

  // POST /admin/booking-enquiries/:id/admin-notified  -> mark adminNotified = true
  @Post(':id/admin-notified')
  @HttpCode(HttpStatus.OK)
  async markAdminNotified(@Param('id') id: string) {
    const rec = await this.bookingService.getBookingEnquiry(id);
    if (!rec) throw new NotFoundException('Booking enquiry not found');
    await this.bookingService.markAdminNotified(id);
    return { ok: true };
  }

  // POST /admin/booking-enquiries/:id/host-notified  -> mark hostNotified = true
  @Post(':id/host-notified')
  @HttpCode(HttpStatus.OK)
  async markHostNotified(@Param('id') id: string) {
    const rec = await this.bookingService.getBookingEnquiry(id);
    if (!rec) throw new NotFoundException('Booking enquiry not found');
    await this.bookingService.markHostNotified(id);
    return { ok: true };
  }
}
