// src/modules/about/team.controller.ts
import { Body, Controller, Delete, Param, Post, Put } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';


@Controller('admin/pages/about/team')
export class AdminAboutTeamController {
  constructor(private prisma: PrismaService) {}

  @Post()
  async create(@Body() data: any) {
    // expects aboutId or will attach to 'about' by slug
    const about = await this.prisma.aboutPage.findUnique({ where: { slug: 'about' } });
    if (!about) throw new Error('About page not found');

    const created = await this.prisma.teamMember.create({
      data: {
        aboutId: about.id,
        name: data.name,
        role: data.role ?? null,
        bio: data.bio ?? null,
        photo: data.photo ?? null,
        social: data.social ?? null,
        order: data.order ?? 0,
      },
    });
    return created;
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() data: any) {
    const updated = await this.prisma.teamMember.update({
      where: { id },
      data: {
        name: data.name,
        role: data.role,
        bio: data.bio,
        photo: data.photo,
        social: data.social,
        order: data.order,
      },
    });
    return updated;
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.prisma.teamMember.delete({ where: { id } });
    return { success: true };
  }
}
