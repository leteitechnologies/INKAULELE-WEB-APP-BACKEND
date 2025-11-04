import { Controller, Get, Param } from '@nestjs/common';
import { DurationsService } from './durations.service';

@Controller('durations')
export class DurationsController {
  constructor(private readonly service: DurationsService) {}

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.service.findById(id);
  }
}
