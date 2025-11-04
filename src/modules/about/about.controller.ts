// src/modules/about/about.controller.ts
import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { AboutService } from './about.service';

@Controller('about')
export class AboutController {
  constructor(private aboutService: AboutService) {}

  @Get()
  async getAbout() {
    const res = await this.aboutService.getAbout();
    if (!res) {
      throw new HttpException({ message: 'About not found' }, HttpStatus.NOT_FOUND);
    }
    return res;
  }
}
