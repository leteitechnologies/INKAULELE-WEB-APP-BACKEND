// src/modules/experiences/experiences.module.ts
import { Module } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ExperiencesService } from './experiences.service';
import { ExperiencesController } from './experiences.controller';
import { FxModule } from '@app/fx-rates/fx.module';
import { AvailabilityModule } from '../availability/availability.module';

@Module({
  imports:[FxModule, AvailabilityModule],
  controllers: [ExperiencesController],
  providers: [ExperiencesService, PrismaService],
})
export class ExperiencesModule {}
