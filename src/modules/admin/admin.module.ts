import { Module } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AdminStatsController } from './admin-stats.controller';
import { AdminBookingController } from '../bookings/booking.admin.controller';
import { SuggestionsService } from './suggestions/suggestions.service';
import { SuggestionsController } from './suggestions/suggestions.controller';
import { VoucherModule } from '../voucher/voucher.module';


@Module({
   imports: [VoucherModule],
  controllers: [AdminStatsController, AdminBookingController, SuggestionsController],
  providers: [PrismaService, SuggestionsService],
})
export class AdminModule {}
