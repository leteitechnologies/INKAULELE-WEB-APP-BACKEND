import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { GalleryController } from './gallery.controller';

import { GalleryService } from './gallery.service';
import { GalleryUploadController } from './upload.controller';

@Module({
  imports: [PrismaModule],
  controllers: [GalleryController, GalleryUploadController],
  providers: [GalleryService],
  exports: [GalleryService],
})
export class GalleryModule {}
