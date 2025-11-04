// src/modules/contact/contact.module.ts
import { Module } from '@nestjs/common';

import { ContactController } from './contact.controller';
import { PrismaModule } from '../../../prisma/prisma.module';
import { MailerModule } from '../mailer/mailer.module';
import { ContactService } from './contact.service';
import { AdminContactController } from './contact.admin.controller';

@Module({
  imports: [PrismaModule, MailerModule],
  providers: [ContactService],
  controllers: [ContactController, AdminContactController],
  exports: [ContactService],
})
export class ContactModule {}
