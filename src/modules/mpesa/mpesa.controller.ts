// src/modules/mpesa/mpesa.controller.ts
import { Controller, Post, Body, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { MpesaService } from './mpesa.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { FxService } from '@app/fx-rates/fx.service'; // ✅ import fx service

@Controller('mpesa')
export class MpesaController {
  constructor(
    private mpesa: MpesaService,
    private prisma: PrismaService,
    private config: ConfigService,
    private fx: FxService, // ✅ inject FX
  ) {}

  @Post('initiate')
  async initiate(
    @Body() body: { bookingId: string; holdToken: string; phone: string; amount: number; currency?: string },
  ) {
    const { bookingId, phone, holdToken, amount, currency } = body;
const MAX_STK = 250_000;
    function normalizePhone(serverPhone: any) {
      const p = String(serverPhone ?? '').trim();
      const noPlus = p.startsWith('+') ? p.slice(1) : p;
      if (!/^2547\d{8}$/.test(noPlus)) {
        throw new BadRequestException('Phone must be in 2547XXXXXXXX format (no leading +).');
      }
      return noPlus;
    }

    const normalizedPhone = normalizePhone(phone);

    const booking = await this.prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new BadRequestException('Booking not found');

    const crypto = require('crypto');
    const suppliedHash = crypto.createHash('sha256').update(String(holdToken)).digest('hex');
    if (booking.holdTokenHash !== suppliedHash) throw new BadRequestException('Invalid hold token');

    // ✅ Convert USD → KES if needed
    let amountKES = amount;
    const curr = (currency ?? booking.currency ?? 'KES').toUpperCase();
    if (curr !== 'KES') {
      const rate = await this.fx.getRate(curr, 'KES');
      if (!rate || rate <= 0) {
        throw new InternalServerErrorException(`FX rate unavailable for ${curr}->KES`);
      }
      amountKES = Math.round(amount * rate);
    }

    // Server-side enforcement: refuse M-Pesa for amounts > MAX_STK
    if (amountKES > MAX_STK) {
      throw new BadRequestException(
        `Amount exceeds M-Pesa single-transaction limit of KSh ${MAX_STK.toLocaleString()}. Please complete payment with card (Stripe) or split the payment.`
      );
    }

    // 2) create pending transaction
    const txn = await this.prisma.mpesaTransaction.create({
      data: {
        bookingId,
        phone: normalizedPhone,
        amount,
        currency: curr,
        amountKES,
      },
    });

    const secret = this.config.get('MPESA_CALLBACK_SECRET');
    const cb = `${this.config.get('MPESA_CALLBACK_URL')}?secret=${encodeURIComponent(secret)}`;

    // ✅ Use converted amount
    const res = await this.mpesa.createStkPush({
      amount: amountKES,
      phone: normalizedPhone,
      accountReference: booking.reference ?? booking.id,
      transactionDesc: `Booking ${booking.id}`,
      callbackUrl: cb,
    });

    const checkoutRequestId = res?.CheckoutRequestID;
    const merchantRequestId = res?.MerchantRequestID;

    await this.prisma.mpesaTransaction.update({
      where: { id: txn.id },
      data: { checkoutRequestId, merchantRequestId },
    });

    return { ok: true, checkoutRequestId, merchantRequestId, amountKES };
  }
}
