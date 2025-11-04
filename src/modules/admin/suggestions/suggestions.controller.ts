// src/modules/admin/suggestions.controller.ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SuggestionsService } from './suggestions.service';

// optionally add AuthGuard/RoleGuard to protect these endpoints
@Controller('admin/suggestions')
export class SuggestionsController {
  constructor(private svc: SuggestionsService) {}

  @Get('subtitles')
  async subtitles(@Query('q') q: string) {
    const suggestions = await this.svc.suggestSubtitles(q ?? '');
    return { suggestions };
  }

  @Get('titles')
  async titles(@Query('q') q: string) {
    const suggestions = await this.svc.suggestTitles(q ?? '');
    return { suggestions };
  }
}
