import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateSocialDto } from './dto/create-social.dto';
import { UpdateSocialDto } from './dto/update-social.dto';

@Injectable()
export class SocialsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.socialLink.findMany({ orderBy: { order: 'asc' } });
  }

  async findActive() {
    return this.prisma.socialLink.findMany({ where: { active: true }, orderBy: { order: 'asc' } });
  }

  async create(dto: CreateSocialDto) {
    return this.prisma.socialLink.create({ data: dto });
  }

  async update(id: string, dto: UpdateSocialDto) {
    return this.prisma.socialLink.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    return this.prisma.socialLink.delete({ where: { id } });
  }

  async findByName(name: string) {
    return this.prisma.socialLink.findFirst({ where: { name } });
  }
}
