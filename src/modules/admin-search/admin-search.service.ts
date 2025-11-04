// src/modules/admin-search/admin-search.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SearchSection, SearchItem } from './admin-search.types';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class AdminSearchService {
  private readonly logger = new Logger(AdminSearchService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Search across multiple admin resources in parallel and return sections.
   * Keeps queries simple and safe (uses Prisma query building).
   */
  async search(q: string, limit = 5): Promise<SearchSection[]> {
    const cleanQ = (q || '').trim();
    if (!cleanQ) return [];

    // clamp limit to a sane range
    const take = Math.max(1, Math.min(50, Number(limit || 5)));

    // build typed where-clause arrays to satisfy Prisma's generated TS types
    const destinationClauses: Prisma.DestinationWhereInput[] = [
      { title: { contains: cleanQ, mode: 'insensitive' } },
      { slug: { contains: cleanQ, mode: 'insensitive' } },
      { country: { contains: cleanQ, mode: 'insensitive' } },
      // tags is a string[] column; `has` checks for exact tag equality
      { tags: { has: cleanQ } },
    ];

    const experienceClauses: Prisma.ExperienceWhereInput[] = [
      { title: { contains: cleanQ, mode: 'insensitive' } },
      { slug: { contains: cleanQ, mode: 'insensitive' } },
      { country: { contains: cleanQ, mode: 'insensitive' } },
      { tags: { has: cleanQ } },
    ];

    const userClauses: Prisma.UserWhereInput[] = [
      { name: { contains: cleanQ, mode: 'insensitive' } },
      { email: { contains: cleanQ, mode: 'insensitive' } },
    ];

    const bookingClauses: Prisma.BookingWhereInput[] = [
      { reference: { contains: cleanQ, mode: 'insensitive' } },
      { travelerName: { contains: cleanQ, mode: 'insensitive' } },
      { travelerEmail: { contains: cleanQ, mode: 'insensitive' } },
    ];

    // now create typed where objects
    const destinationWhere: Prisma.DestinationWhereInput = { OR: destinationClauses };
    const experienceWhere: Prisma.ExperienceWhereInput = { OR: experienceClauses };
    const userWhere: Prisma.UserWhereInput = { OR: userClauses };
    const bookingWhere: Prisma.BookingWhereInput = { OR: bookingClauses };

    // execute in parallel
    const [
      destinations,
      experiences,
      users,
      bookings,
    ] = await Promise.all([
      this.prisma.destination.findMany({
        where: destinationWhere,
        take,
        orderBy: [{ featured: 'desc' }, { updatedAt: 'desc' }],
        select: { id: true, title: true, slug: true, country: true, coverImage: true },
      }),
      this.prisma.experience.findMany({
        where: experienceWhere,
        take,
        orderBy: [{ featured: 'desc' }, { updatedAt: 'desc' }],
        select: { id: true, title: true, slug: true, country: true, coverImage: true },
      }),
      this.prisma.user.findMany({
        where: userWhere,
        take,
        orderBy: [{ updatedAt: 'desc' }],
        select: { id: true, name: true, email: true },
      }),
      this.prisma.booking.findMany({
        where: bookingWhere,
        take,
        orderBy: [{ createdAt: 'desc' }],
        select: { id: true, reference: true, travelerName: true, travelerEmail: true, status: true },
      }),
    ]);

    const mapDest = (d: any): SearchItem => ({
      id: d.id,
      title: d.title,
      subtitle: d.country,
      url: `/admin/destinations/${d.id}`,
      type: 'destination',
      meta: { slug: d.slug, coverImage: d.coverImage },
    });

    const mapExp = (e: any): SearchItem => ({
      id: e.id,
      title: e.title,
      subtitle: e.country,
      url: `/admin/experiences/${e.id}`,
      type: 'experience',
      meta: { slug: e.slug, coverImage: e.coverImage },
    });

    const mapUser = (u: any): SearchItem => ({
      id: u.id,
      title: u.name ?? u.email,
      subtitle: u.email,
      url: `/admin/users/${u.id}`,
      type: 'user',
      meta: {},
    });

    const mapBooking = (b: any): SearchItem => ({
      id: b.id,
      title: b.reference ?? `Booking ${b.id.slice(0, 8)}`,
      subtitle: b.travelerName ?? b.travelerEmail,
      url: `/admin/bookings/${b.id}`,
      type: 'booking',
      meta: { status: b.status },
    });

    const sections: SearchSection[] = [];

    if (destinations.length) sections.push({ id: 'destinations', title: 'Destinations', items: destinations.map(mapDest) });
    if (experiences.length) sections.push({ id: 'experiences', title: 'Experiences', items: experiences.map(mapExp) });
    if (users.length) sections.push({ id: 'users', title: 'Users', items: users.map(mapUser) });
    if (bookings.length) sections.push({ id: 'bookings', title: 'Bookings', items: bookings.map(mapBooking) });

    return sections;
  }

  /**
   * Optional: fallback fuzzy search using pg_trgm via prisma.$queryRaw if you need fuzzy matching
   * Example (uncomment and adapt if you want to enable):
   *
   * const fuzzyDest = await this.prisma.$queryRaw`
   *   SELECT id, title, slug, country, cover_image
   *   FROM "Destination"
   *   WHERE similarity(title, ${cleanQ}) > 0.2 OR title ILIKE '%' || ${cleanQ} || '%'
   *   ORDER BY GREATEST(similarity(title, ${cleanQ}), 0) DESC
   *   LIMIT ${take}
   * `;
   */
}
