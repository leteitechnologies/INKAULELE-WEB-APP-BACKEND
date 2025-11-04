import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class DurationsService {
  constructor(private prisma: PrismaService) {}

  async findById(id: string) {
    const dur = await this.prisma.durationOption.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        days: true,
        durationLabel: true,
        maxNights: true,
        minGuests: true,
        maxGuests: true,
        priceFrom: true,
        priceModel: true,
        maxRooms: true,
        maxInfants: true,
        currency: true,
        // If you have a defaultGuests column as JSON, select it here:
        // defaultGuests: true,
      },
    });

    if (!dur) throw new NotFoundException(`Duration not found: ${id}`);
    return dur;
  }
}
