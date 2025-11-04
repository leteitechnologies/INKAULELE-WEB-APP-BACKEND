import { Module } from '@nestjs/common';
import { DestinationsService } from './destinations.service';
import { DestinationsController } from './destinations.controller';
import { PrismaService } from '../../../prisma/prisma.service';
import { FxModule } from '@app/fx-rates/fx.module';

@Module({
  imports:[FxModule],
  controllers: [DestinationsController],
  providers: [DestinationsService, PrismaService],
})
export class DestinationsModule {}
