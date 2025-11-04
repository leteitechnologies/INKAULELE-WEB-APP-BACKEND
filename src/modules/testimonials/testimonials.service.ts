// src/modules/testimonials/testimonials.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class TestimonialsService {
  constructor(private prisma: PrismaService) {}

  async listAll() {
    const rows = await this.prisma.testimonial.findMany({
      where: { active: true },
      orderBy: { order: 'asc' },
    });
    return rows.map(r => ({
      id: r.id,
      author: r.author,
      quote: r.quote,
      photo: r.photo,
      role: r.role,
      order: r.order,
    }));
  }

  async getById(id: string) {
    return this.prisma.testimonial.findUnique({ where: { id } });
  }
}
