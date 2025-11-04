// src/modules/bookings/booking.query.controller.ts
import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Controller('booking') // stays singular
export class BookingQueryController {
  constructor(private prisma: PrismaService) {}

  // GET /booking/:id
  @Get(':id')
  async getBooking(@Param('id') id: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        destination: true, // include destination so client can read title/region
      },
      // you can still limit fields if desired using `select`, but include is simplest here
    });

    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }
}
