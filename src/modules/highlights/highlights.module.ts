// src/modules/highlights/highlights.module.ts
import { Module } from '@nestjs/common';
import { HighlightsService } from './highlights.service';
import { HighlightsController } from './highlights.controller';
import { PrismaModule } from '../../../prisma/prisma.module';


@Module({
  imports: [PrismaModule],
  providers: [HighlightsService],
  controllers: [HighlightsController],
  exports: [HighlightsService],
})
export class HighlightsModule {}
