// src/modules/about/about.module.ts
import { Module } from '@nestjs/common';
import { AboutService } from './about.service';
import { AboutController } from './about.controller';
import { AdminAboutController } from './admin-about.controller';
import { AdminAboutTeamController } from './team.controller';
import { PrismaService } from '../../../prisma/prisma.service';


@Module({
  providers: [AboutService, PrismaService],
  controllers: [AboutController, AdminAboutController, AdminAboutTeamController],
  exports: [AboutService],
})
export class AboutModule {}
