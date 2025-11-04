import { Controller, Post, Body, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import StripeService from './stripe/stripe.service';
import { PrismaService } from '../../../prisma/prisma.service';
import crypto from 'crypto';
import { generateUniqueBookingReference } from '@app/utils/reference';

@Controller('checkout')
export class CheckoutController {
  constructor(private stripeService: StripeService, private prisma: PrismaService) {}

  @Post('create-session')
  async createCheckoutSession(@Body() body: any) {
    const {
      bookingId,
      holdToken,
      successPath,
      cancelPath,
      email,
      fullName,
      phone,
    } = body;

    if (!bookingId || !holdToken)
      throw new BadRequestException('bookingId and holdToken required');

    // 1️⃣ Validate booking & hold token
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        destination: true,
        durationOption: true,
      },
    });

    if (!booking) throw new BadRequestException('Booking not found');

    const suppliedHash = crypto.createHash('sha256').update(String(holdToken)).digest('hex');
    if (booking.holdTokenHash !== suppliedHash)
      throw new BadRequestException('Invalid hold token');

    if (booking.status !== 'HOLD')
      throw new BadRequestException('Booking not in HOLD state');

    if (booking.holdExpiresAt && booking.holdExpiresAt.getTime() < Date.now())
      throw new BadRequestException('Hold expired');

    // 2️⃣ Save traveler info (email, name, phone) on booking
    await this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        travelerEmail: email,
        travelerName: fullName,
        travelerPhone: phone,
        reference: await generateUniqueBookingReference(this.prisma),
      },
    });

    // 3️⃣ Prepare amount & currency
    const amount = Math.round((booking.totalPrice ?? 0) * 100);
    const currency = (booking.currency ?? 'usd').toLowerCase();

    // 4️⃣ Build success/cancel URLs
    const allowedOrigins = [
      'http://localhost:3001',
      'http://localhost:3002',
      'http://192.168.8.12:3001',
      'http://192.168.8.12:3002',
    ];
    const origin = allowedOrigins.find(o => o.includes('192.168.8.12')) || allowedOrigins[0];

    const success_url = successPath
      ? `${origin}${successPath}`
      : `${origin}/booking/success?bookingId=${bookingId}&session_id={CHECKOUT_SESSION_ID}`;
      

    const cancel_url = cancelPath
      ? `${origin}${cancelPath}`
      : `${origin}/booking/cancel?bookingId=${bookingId}`;

    // 5️⃣ Create Stripe checkout session
    try {
      const idempotencyKey = crypto
  .createHash('sha256')
  .update(`checkout_${bookingId}_${holdToken}_${booking.totalPrice}`)
  .digest('hex');
      const session = await this.stripeService.client().checkout.sessions.create(
        {
          mode: 'payment',
          payment_method_types: ['card'], // only allow card payments
          payment_method_options: { card: { setup_future_usage: 'off_session' } },
          allow_promotion_codes: false,
          customer_email: email, // ✅ 

          line_items: [
            {
              price_data: {
                currency,
                product_data: {
                  name: booking.destination.title,
                  description: booking.durationOption
                    ? `${booking.durationOption.title} • ${booking.nights} night${booking.nights > 1 ? 's' : ''}`
                    : `Your ${booking.nights}-night ${booking.destination.region ?? ''} experience`,
                },
                unit_amount: amount,
              },
              quantity: 1,
            },
          ],

          metadata: { bookingId },
          success_url,
          cancel_url,
        },
{ idempotencyKey },
      );

      // 6️⃣ Save Payment Intent ID
await this.prisma.booking.update({
  where: { id: bookingId },
  data: {
    stripePaymentIntentId:
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent as any)?.id,
    stripeCheckoutSessionId: session.id, // <-- new
  },
});

      return { url: session.url };
    } catch (err) {
      console.error('createCheckoutSession error', err);
      throw new InternalServerErrorException('Failed to create Stripe Checkout session');
    }
  }
}
