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
  Delete,
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
  // src/modules/booking/admin.controller.ts (inside AdminInquiryBookingController)
  // GET /admin/booking-enquiries/latest
  @Get('latest')
  async latest(
    @Query('limit') limit?: string,
    @Query('days') days?: string,
    @Query('unnotified') unnotified?: string,
  ) {
    // parse safe numbers
    const parsedLimit = typeof limit === 'string' && limit.trim() !== '' ? Math.max(1, Math.trunc(Number(limit) || 0)) : undefined;
    const parsedDays = typeof days === 'string' && days.trim() !== '' ? Math.max(1, Math.trunc(Number(days) || 0)) : undefined;
    let parsedUnnotified: boolean | undefined = undefined;
    if (unnotified === 'true') parsedUnnotified = true;
    else if (unnotified === 'false') parsedUnnotified = false;

    this.logger.debug('Admin: /latest called', { limit: parsedLimit, days: parsedDays, unnotified: parsedUnnotified });

    const rows = await this.bookingService.listLatestBookingEnquiries({
      limit: parsedLimit,
      days: parsedDays,
      unnotified: parsedUnnotified,
    });

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

  // DELETE /admin/booking-enquiries/:id
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string) {
    const rec = await this.bookingService.getBookingEnquiry(id);
    if (!rec) throw new NotFoundException('Booking enquiry not found');
    await this.bookingService.deleteBookingEnquiry(id);
    return { ok: true };
  }
}
