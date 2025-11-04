// src/modules/bookings/admin-booking.controller.ts
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { VoucherService } from '../voucher/voucher.service';

@Controller('admin/bookings')
export class AdminBookingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly voucherService: VoucherService, // <- injected
  ) {}

  @Post(':id/generate-voucher')
  async generateVoucher(
    @Param('id') id: string,
    @Body() body: { supplierId?: string; supplierName?: string; providerInfo?: any; sendEmail?: boolean }
  ) {
    const { supplierId, supplierName, providerInfo, sendEmail = true } = body;
    const res = await this.voucherService.generateVoucherForBooking(id, {
      supplier: supplierId ? { id: supplierId, name: supplierName, ...providerInfo } : undefined,
      sendEmail,
    });
    return { ok: true, data: res.booking, tokenPublic: res.tokenPublic };
  }
  /**
   * GET /admin/bookings
   * Return all bookings (paginated by `limit` query).
   */
  @Get()
  async getAllBookings(@Query('limit') limit: string = '100') {
    const take = Math.min(Number(limit) || 100, 500);
    const bookings = await this.prisma.booking.findMany({
      orderBy: { createdAt: 'desc' },
      take,
    });

    // wrap with { data: [...] } for consistency with other endpoints
    return { data: bookings, meta: { count: bookings.length } };
  }
    /**
   * GET /admin/bookings/latest
   * Returns the latest confirmed bookings (for admin dashboard)
   */
  @Get('latest')
  async getLatestBookings(@Query('limit') limit: string = '10') {
    const take = Math.min(Number(limit) || 10, 50); // hard limit max 50

    const bookings = await this.prisma.booking.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        destination: { select: { title: true, region: true, country: true } },
        experience: { select: { title: true, region: true } },
      },
    });

    // format payload for the admin UI and wrap
    const payload = bookings.map(b => ({
      id: b.id,
      reference: b.reference,
      travelerName: b.travelerName,
      travelerEmail: b.travelerEmail,
      destination: b.destination?.title ?? b.experience?.title,
      region: b.destination?.region ?? b.experience?.region,
      country: b.destination?.country ?? null,
      status: b.status,
      totalPrice: b.totalPrice,
      currency: b.currency,
      createdAt: b.createdAt,
    }));

    return { data: payload, meta: { count: payload.length } };
  }
@Get(':id')
async getAdminBooking(@Param('id') id: string) {
  return this.prisma.booking.findUnique({ where: { id }, include: { destination: true } });
}


}
