
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ReceiptModule } from '@app/modules/receipt/receipt.module';
import { MailerModule } from '@app/modules/mailer/mailer.module';
import { VoucherModule } from '@app/modules/voucher/voucher.module';
import { PrismaService } from '../../../prisma/prisma.service';
import { MpesaService } from './mpesa.service';

import { MpesaCallbackController } from './mpesa.callback.controller';
import { CheckoutQueryController } from '../payments/checkout.query.controller';
import { CheckoutController } from '../payments/Checkout.controller';
import { StripeModule } from '../payments/stripe/stripe.module';
import { MpesaController } from './mpesa.controller';
import { FxModule } from '@app/fx-rates/fx.module';


@Module({
  imports: [ConfigModule, ReceiptModule, MailerModule, VoucherModule, StripeModule, FxModule],
  providers: [MpesaService, PrismaService, ConfigService],
  controllers: [
    CheckoutController,
    MpesaCallbackController,
    CheckoutQueryController,
    MpesaController, // <-- ADD THIS
  ],
  exports: [MpesaService],
})
export class MpesaModule {}
