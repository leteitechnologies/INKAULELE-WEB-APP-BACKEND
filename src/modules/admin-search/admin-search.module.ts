// src/modules/admin-search/admin-search.module.ts
import { Module } from '@nestjs/common';
import { AdminSearchService } from './admin-search.service';
import { AdminSearchController } from './admin-search.controller';
import { PrismaModule } from '../../../prisma/prisma.module';


@Module({
  imports: [PrismaModule],
  controllers: [AdminSearchController],
  providers: [AdminSearchService],
})
export class AdminSearchModule {}
