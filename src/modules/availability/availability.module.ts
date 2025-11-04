import { Module } from '@nestjs/common';
import { AvailabilityController } from './availability.controller';
import { PrismaService } from '../../../prisma/prisma.service';
import { AvailabilityService } from './availability.service';
import { BookingQueryController } from '../bookings/booking.query.controller';
import { MailerModule } from '../mailer/mailer.module';

@Module({
  imports: [MailerModule],
  controllers: [AvailabilityController, BookingQueryController],
  providers: [AvailabilityService, PrismaService],
    exports: [AvailabilityService], 
})
export class AvailabilityModule {}
