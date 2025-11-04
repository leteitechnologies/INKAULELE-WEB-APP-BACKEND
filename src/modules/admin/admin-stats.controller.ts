import { Controller, Get, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Controller('admin')
export class AdminStatsController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /admin/counts
   * Return aggregated counts used by the admin dashboard.
   */
  @Get('counts')
  async getCounts() {
    try {
      const [destinations, experiences, bookings, users] = await Promise.all([
        this.prisma.destination.count(),
        this.prisma.experience.count(),
        this.prisma.booking.count(),
        this.prisma.user.count(),
      ]);

      return {
        data: {
          destinations,
          experiences,
          bookings,
          users,
        },
        meta: {
          fetchedAt: new Date().toISOString(),
        },
      };
    } catch (err) {
      // Useful to log server-side details if you have a logger
      // console.error('AdminStatsController.getCounts error', err);
      throw new InternalServerErrorException('Failed to compute admin counts');
    }
  }
}
