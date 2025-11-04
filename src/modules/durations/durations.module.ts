import { Module } from '@nestjs/common';
import { DurationsController } from './durations.controller';
import { DurationsService } from './durations.service';
import { PrismaService } from '../../../prisma/prisma.service';

@Module({
  controllers: [DurationsController],
  providers: [DurationsService, PrismaService],
  exports: [DurationsService],
})
export class DurationsModule {}
