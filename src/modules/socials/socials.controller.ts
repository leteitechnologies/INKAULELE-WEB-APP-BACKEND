import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  HttpCode,
  HttpStatus,
  UsePipes,
  ValidationPipe,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { SocialsService } from './socials.service';
import { CreateSocialDto } from './dto/create-social.dto';
import { UpdateSocialDto } from './dto/update-social.dto';

// TODO: add guards to mutation routes (admin authentication)
@Controller('socials')
export class SocialsController {
  constructor(private readonly socialsService: SocialsService) {}

  // public GET: return only active entries
  @Get()
  async getPublic() {
    const socials = await this.socialsService.findActive();
    return { socials };
  }

  // admin list (optionally include inactive) - you can protect this route with your auth guard
  @Get('all')
  async getAll() {
    const socials = await this.socialsService.findAll();
    return { socials };
  }

  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false }))
  async create(@Body() body: CreateSocialDto) {
    // optional uniqueness enforcement on name
    const existing = await this.socialsService.findByName(body.name);
    if (existing) throw new BadRequestException('Social link with that name already exists');
    const created = await this.socialsService.create(body);
    return { social: created };
  }

  @Put(':id')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false }))
  async update(@Param('id') id: string, @Body() body: UpdateSocialDto) {
    try {
      const updated = await this.socialsService.update(id, body);
      return { social: updated };
    } catch (err) {
      throw new NotFoundException('Social link not found');
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    try {
      await this.socialsService.remove(id);
      return;
    } catch (err) {
      throw new NotFoundException('Social link not found');
    }
  }
}
