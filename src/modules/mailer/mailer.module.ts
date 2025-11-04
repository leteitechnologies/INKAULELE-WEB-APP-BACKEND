// src/modules/mailer/mailer.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MailerService } from './mailer.service';

@Module({
  imports: [ConfigModule], 
  providers: [MailerService],              // single provider
  exports: [MailerService],                // exported for other modules
})
export class MailerModule {}
