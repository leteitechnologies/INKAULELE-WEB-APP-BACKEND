// src/modules/payments/stripe.module.ts
import { Module } from '@nestjs/common';
import { ConfigService, ConfigModule } from '@nestjs/config';
import StripeService from './stripe.service';
import { StripeWebhookController } from './webhook.controller';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CheckoutController } from '../Checkout.controller';
import { CheckoutQueryController } from '../checkout.query.controller';
import { ReceiptModule } from '@app/modules/receipt/receipt.module';
import { MailerModule } from '@app/modules/mailer/mailer.module';
import { VoucherModule } from '@app/modules/voucher/voucher.module';

@Module({
  imports: [ConfigModule, ReceiptModule, MailerModule, VoucherModule],
  providers: [StripeService, PrismaService, ConfigService],
  controllers: [CheckoutController, StripeWebhookController, CheckoutQueryController],
  exports: [StripeService],
})
export class StripeModule {}
