// src/modules/about/admin-about.controller.ts
import { Body, Controller, Put } from '@nestjs/common';
import { AboutService } from './about.service';
import { AboutPayload } from './types';

@Controller('admin/pages/about')
export class AdminAboutController {
  constructor(private aboutService: AboutService) {}

  @Put()
  async update(@Body() body: AboutPayload) {
    return this.aboutService.updateAbout(body);
  }
}
