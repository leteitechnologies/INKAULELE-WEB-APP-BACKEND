import { Module } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { ReviewsController } from './reviews.controller';
import { PrismaService } from '../../../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { MailerModule } from '../mailer/mailer.module';


@Module({
  imports: [MailerModule],
  providers: [ReviewsService, PrismaService],
  controllers: [ReviewsController],
})
export class ReviewsModule {}
