import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Put,
} from '@nestjs/common';
import { HighlightsService } from './highlights.service';

@Controller('highlights')
export class HighlightsController {
  constructor(private readonly highlights: HighlightsService) {}

  @Get()
  list() {
    return this.highlights.listAll();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.highlights.getById(id);
  }

  @Post()
  create(@Body() body: any) {
    return this.highlights.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.highlights.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.highlights.remove(id);
  }

  // ✅ New bulk publish endpoint
  @Put('bulk')
  async bulkPublish(@Body() items: any[]) {
    return this.highlights.bulkPublish(items);
  }
}
