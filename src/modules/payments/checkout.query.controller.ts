// src/modules/payments/checkout.query.controller.ts
import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import StripeService from './stripe/stripe.service';
import { PrismaService } from '../../../prisma/prisma.service';

@Controller('checkout')
export class CheckoutQueryController {
  constructor(private stripeService: StripeService, private prisma: PrismaService) {}

  @Get('session/:sessionId')
  async getSession(@Param('sessionId') sessionId: string) {
    // retrieve session from Stripe (expand payment_intent if needed)
    const session = await this.stripeService.client().checkout.sessions.retrieve(sessionId as string);
    if (!session) throw new NotFoundException('Session not found');

    const bookingId = session.metadata?.bookingId ?? null;
    const booking = bookingId
      ? await this.prisma.booking.findUnique({
          where: { id: bookingId },
          include: { destination: true, durationOption: true }, // include related data
        })
      : null;

    return { session, booking };
  }
}
