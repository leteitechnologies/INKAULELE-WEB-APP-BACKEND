import { Controller, Get, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Controller('admin')
export class AdminStatsController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /admin/counts
   * Return aggregated counts used by the admin dashboard.
   *
   * Note: counting booking enquiries (BookingEnquiry) rather than bookings.
   */
  @Get('counts')
  async getCounts() {
    try {


      const [destinations, experiences, bookingEnquiries, users] =
        await Promise.all([
          this.prisma.destination.count(),
          this.prisma.experience.count(),
          this.prisma.bookingEnquiry.count(),
          this.prisma.user.count(),
      
        ]);

      return {
        data: {
          destinations,
          experiences,
          bookingEnquiries,
          users,
        },
        meta: {
          fetchedAt: new Date().toISOString(),
        },
      };
    } catch (err) {
      throw new InternalServerErrorException('Failed to compute admin counts');
    }
  }
}
