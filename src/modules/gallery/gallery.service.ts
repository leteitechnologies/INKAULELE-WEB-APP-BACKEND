import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateGalleryDto } from './dto/create-gallery.dto';
import { UpdateGalleryDto } from './dto/update-gallery.dto';


@Injectable()
export class GalleryService {
  constructor(private prisma: PrismaService) {}

  findManyByDestination(destinationId: string) {
    return this.prisma.gallery.findMany({
      where: { destinationId },
      orderBy: { order: 'asc' },
    });
  }

  findAll() {
    return this.prisma.gallery.findMany({ orderBy: { order: 'asc' } });
  }

  create(dto: CreateGalleryDto) {
    return this.prisma.gallery.create({ data: dto });
  }

  update(id: string, dto: UpdateGalleryDto) {
    return this.prisma.gallery.update({ where: { id }, data: dto });
  }

  delete(id: string) {
    return this.prisma.gallery.delete({ where: { id } });
  }

  async reorder(ids: string[]) {
    // bulk update using transaction
    const ops = ids.map((id, index) =>
      this.prisma.gallery.update({
        where: { id },
        data: { order: index },
      }),
    );
    return this.prisma.$transaction(ops);
  }
async findUnattached() {
  // raw SQL to handle both NULL and empty-string sentinels
  const rows = await this.prisma.$queryRaw<
    Array<Record<string, any>>
  >`SELECT * FROM "Gallery"
     WHERE ( "destinationId" IS NULL OR "destinationId" = '' )
       AND ( "experienceId" IS NULL OR "experienceId" = '' )
     ORDER BY "order" ASC;`;
  return rows;
}


}
