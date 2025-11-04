// src/modules/bookings/booking.command.controller.ts
import { Controller, Post, Param, Body, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { randomUUID, createHash } from 'crypto';

@Controller('booking')
export class BookingCommandController {
  constructor(private prisma: PrismaService) {}

  /**
   * POST /booking/hold
   * Creates or refreshes a temporary booking hold
   */
@Post('hold')
async createHold(
  @Body()
  body: {
    experienceId?: string;
    from?: string;
    to?: string;
    guests?: any;
    currency?: string;
    bookingId?: string;
    holdToken?: string;
  },
) {
  const { experienceId, from, to, guests, currency, bookingId, holdToken } = body;
const duration = await this.prisma.durationOption.findFirst({
  where: { experienceId },
  select: { destinationId: true },
});
if (!duration) throw new NotFoundException('Experience has no linked destination');

// ensure destinationId is not null
if (!duration.destinationId) {
  throw new NotFoundException('Duration is not linked to any destination');
}
const destinationId = duration.destinationId; // now typed as string

  if (!experienceId && !bookingId)
    throw new BadRequestException('experienceId or bookingId required');
  if (!from || !to)
    throw new BadRequestException('from and to dates required');
  if (!guests)
    throw new BadRequestException('guests info required');

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
  const token = holdToken ?? randomUUID();
  const holdTokenHash = createHash('sha256').update(token).digest('hex');

  let booking;

  if (bookingId) {
    booking = await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        holdExpiresAt: expiresAt,
        holdTokenHash,
        status: 'HOLD',
      },
    });
  } else {
const experience = await this.prisma.experience.findUnique({
  where: { id: experienceId },
});
if (!experience) throw new NotFoundException('Experience not found');


    const nights = Math.max(
      1,
      Math.ceil(
        (new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24),
      ),
    );
booking = await this.prisma.booking.create({
  data: {
    experienceId,
    destinationId,
    fromDate: new Date(from),
    toDate: new Date(to),
    nights,
    adults: guests.adults ?? 1,
    children: guests.children ?? 0,
    infants: guests.infants ?? 0,
    rooms: guests.rooms ?? 1,
    unitsBooked: 1,
    currency: currency?.toUpperCase() ?? 'USD',
    holdTokenHash,
    holdExpiresAt: expiresAt,
    status: 'HOLD',
  },
});

  }

  return {
    ok: true,
    bookingId: booking.id,
    holdToken: token,
    holdExpiresAt: expiresAt,
    available: true,
    currency: booking.currency,
    totalPrice: booking.totalPrice ?? 0,
  };
}


  /**
   * POST /booking/:id/cancel
   * Cancels an existing hold or pending booking
   */
  @Post(':id/cancel')
  async cancelBooking(
    @Param('id') id: string,
    @Body() body: { holdToken?: string; reason?: string },
  ) {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Booking not found');

    // Optional: verify holdToken hash before allowing cancel
    if (booking.holdTokenHash && body.holdToken) {
      const suppliedHash = createHash('sha256').update(body.holdToken).digest('hex');
      if (suppliedHash !== booking.holdTokenHash)
        throw new BadRequestException('Invalid hold token');
    }

    if (booking.status === 'CONFIRMED') {
      throw new BadRequestException('Cannot cancel a confirmed booking via this endpoint');
    }

    const updated = await this.prisma.booking.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
      },
    });

    return { ok: true, booking: updated };
  }
}
