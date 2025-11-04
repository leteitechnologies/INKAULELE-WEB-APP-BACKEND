// src/modules/highlights/highlights.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class HighlightsService {
  constructor(private prisma: PrismaService) {}

  async listAll() {
    return this.prisma.highlight.findMany({
      orderBy: { order: 'asc' },
    });
  }

  async getById(id: string) {
    const highlight = await this.prisma.highlight.findUnique({ where: { id } });
    if (!highlight) throw new NotFoundException(`Highlight ${id} not found`);
    return highlight;
  }

  async create(data: {
    title: string;
    desc?: string;
    icon?: string;
    order?: number;
    active?: boolean;
  }) {
    return this.prisma.highlight.create({ data });
  }

  async update(id: string, data: Partial<{
    title: string;
    desc: string;
    icon: string;
    order: number;
    active: boolean;
  }>) {
    const highlight = await this.prisma.highlight.findUnique({ where: { id } });
    if (!highlight) throw new NotFoundException(`Highlight ${id} not found`);

    return this.prisma.highlight.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    const highlight = await this.prisma.highlight.findUnique({ where: { id } });
    if (!highlight) throw new NotFoundException(`Highlight ${id} not found`);

    return this.prisma.highlight.delete({ where: { id } });
  }
async bulkPublish(items: any[]) {
  await this.prisma.highlight.deleteMany({});

  for (const item of items) {
    await this.prisma.highlight.create({
      data: {
        id: item.id,
        title: item.title,
        desc: item.desc ?? null,
        icon: item.icon ?? null,
        order: item.order ?? 0,
        active: item.active ?? true,
      },
    });
  }

  return { success: true, count: items.length };
}



}
