// src/modules/admin-search/admin-search.controller.ts
import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { AdminSearchService } from './admin-search.service';
import { AdminSearchQueryDto } from './dto/admin-search.dto';


@Controller('admin/search')
export class AdminSearchController {
  constructor(private readonly svc: AdminSearchService) {}

  @Get()
  async get(@Query() query: AdminSearchQueryDto) {
    const q = query.q?.trim();
    if (!q) throw new BadRequestException('Query "q" is required');

    const limit = Math.max(1, Math.min(50, Number(query.limit ?? 5)));
    const sections = await this.svc.search(q, limit);
    return { sections };
  }
}
