// src/modules/mpesa/mpesa.callback.controller.ts
import { Controller, Post, Req, Res, Body, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { MpesaService } from './mpesa.service';
import { ConfigService } from '@nestjs/config';

@Controller('mpesa')
export class MpesaCallbackController {
  private logger = new Logger(MpesaCallbackController.name);

  constructor(private prisma: PrismaService, private mpesa: MpesaService, private config: ConfigService) {}

  @Post('callback')
  async handle(@Req() req: any, @Body() body: any, @Res() res: any) {
    // QUICK ACK (you can ack after minimal checks; but still process)
    res.status(200).json({ Received: true });

    try {
      // optional secret check (if you passed ?secret=... in callback URL)
      const secretParam = req.query?.secret;
      if (this.config.get('MPESA_CALLBACK_SECRET') && secretParam !== this.config.get('MPESA_CALLBACK_SECRET')) {
        this.logger.warn('Callback with invalid secret');
        return;
      }

      // Daraja callback wraps the payload under Body.stkCallback
      const cb = body?.Body?.stkCallback ?? body;
      const checkoutRequestId = cb?.CheckoutRequestID || cb?.checkoutRequestID;
      const resultCode = Number(cb?.ResultCode ?? cb?.resultCode ?? -1);
      const resultDesc = cb?.ResultDesc ?? cb?.resultDesc ?? '';

      if (!checkoutRequestId) {
        this.logger.warn('No CheckoutRequestID in callback');
        return;
      }

      // find transaction
      const txn = await this.prisma.mpesaTransaction.findUnique({ where: { checkoutRequestId } });
      if (!txn) {
        this.logger.warn('MpesaTransaction not found for', checkoutRequestId);
        return;
      }

      // idempotency: if already processed, skip
      if (txn.status === 'SUCCESS' || txn.status === 'FAILED') {
        this.logger.log('Callback already processed', checkoutRequestId);
        return;
      }

      // store raw callback for audit
      await this.prisma.mpesaTransaction.update({
        where: { id: txn.id },
        data: { callbackBody: cb, resultCode, resultDesc, updatedAt: new Date() }
      });

      if (resultCode !== 0) {
        // failed payment
        await this.prisma.mpesaTransaction.update({ where: { id: txn.id }, data: { status: 'FAILED', processedAt: new Date() } });
        return;
      }

      // For safety, call STK Query to double-check result (recommended)
      const queryRes = await this.mpesa.queryStkPush(checkoutRequestId);
      // queryRes should contain a ResultCode / ResultDesc
      const qResultCode = Number(queryRes?.ResultCode ?? queryRes?.resultCode ?? 0);
      if (qResultCode !== 0) {
        // treat as not confirmed
        this.logger.warn('STK Query did not confirm success', checkoutRequestId, queryRes);
        await this.prisma.mpesaTransaction.update({ where: { id: txn.id }, data: { status: 'FAILED', resultDesc: JSON.stringify(queryRes), processedAt: new Date() } });
        return;
      }

      // success confirmed: mark transaction and confirm booking
      await this.prisma.$transaction([
        this.prisma.mpesaTransaction.update({
          where: { id: txn.id },
          data: { status: 'SUCCESS', processedAt: new Date(), resultDesc: resultDesc }
        }),
        // idempotent booking update: only update if still HOLD
        this.prisma.booking.updateMany({
          where: { id: txn.bookingId, status: 'HOLD' },
          data: { status: 'CONFIRMED', stripePaymentIntentStatus: 'MPESA', updatedAt: new Date() }
        })
      ]);

      // enqueue receipt generation / voucher creation / email job (do not block callback)
      // e.g. push a job to queue (Bull/Redis) to generate receipt & email
    } catch (err) {
      this.logger.error('Error handling Mpesa callback', err);
    }
  }
}
