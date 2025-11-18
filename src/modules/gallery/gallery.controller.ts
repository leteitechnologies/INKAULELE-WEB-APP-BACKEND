import { Controller, Get, Query, Post, Body, Put, Param, Delete, Patch, UseGuards } from '@nestjs/common';
import { GalleryService } from './gallery.service';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
// import { RolesGuard } from '../auth/roles.guard';
// import { Roles } from '../auth/roles.decorator';
import { CreateGalleryDto } from './dto/create-gallery.dto';
import { UpdateGalleryDto } from './dto/update-gallery.dto';
import { ReorderDto } from './dto/reorder.dto';

@Controller()
export class GalleryController {
  constructor(private svc: GalleryService) {}

  // public
  @Get('/destinations/:id/gallery')
  async forDestination(@Param('id') id: string) {
    return this.svc.findManyByDestination(id);
  }

  @Get('/gallery')
  async list() {
    return this.svc.findAll();
  }

  // admin routes
  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Roles('ADMIN','EDITOR')
@Get('/admin/gallery')
adminList(@Query('unattached') unattached?: string) {
  // if ?unattached=true requested, return only unattached images
  if (unattached === 'true') return this.svc.findUnattached();
  return this.svc.findAll();
}

  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Roles('ADMIN','EDITOR')
  @Post('/admin/gallery')
  create(@Body() dto: CreateGalleryDto) {
    return this.svc.create(dto);
  }

  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Roles('ADMIN','EDITOR')
  @Put('/admin/gallery/:id')
  update(@Param('id') id: string, @Body() dto: UpdateGalleryDto) {
    return this.svc.update(id, dto);
  }

  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Roles('ADMIN','EDITOR')
  @Delete('/admin/gallery/:id')
  remove(@Param('id') id: string) {
    return this.svc.delete(id);
  }

  // @UseGuards(JwtAuthGuard, RolesGuard)
  // @Roles('ADMIN','EDITOR')
  @Patch('/admin/gallery/reorder')
  reorder(@Body() dto: ReorderDto) {
    return this.svc.reorder(dto.ids);
  }
}
