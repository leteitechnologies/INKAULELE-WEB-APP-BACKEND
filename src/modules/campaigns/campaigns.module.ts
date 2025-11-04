import { Module } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConfigModule } from '@nestjs/config';
import { MailerModule } from '../mailer/mailer.module';


@Module({
  imports: [ConfigModule, MailerModule],
  controllers: [CampaignsController],
  providers: [CampaignsService, PrismaService],
  exports: [CampaignsService],
})
export class CampaignsModule {}
