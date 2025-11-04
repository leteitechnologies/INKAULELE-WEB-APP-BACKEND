import { Module } from '@nestjs/common';
import { VoucherService } from './voucher.service';
import { MailerModule } from '../mailer/mailer.module';


@Module({
    imports: [MailerModule],
  providers: [VoucherService],
  exports: [VoucherService], // <-- export it
})
export class VoucherModule {}
