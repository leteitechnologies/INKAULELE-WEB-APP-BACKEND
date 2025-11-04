// src/modules/admin/suggestions.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';


@Injectable()
export class SuggestionsService {
  constructor(private prisma: PrismaService) {}

  async suggestSubtitles(q: string, limit = 20) {
    if (!q || q.trim().length === 0) return [];
    const pattern = `%${q.trim()}%`;

    // Use parameterized $queryRaw to avoid injection
    const rows: Array<{ subtitle: string; cnt: number }> = await this.prisma.$queryRaw`
      SELECT "subtitle", COUNT(*) AS cnt
      FROM "Destination"
      WHERE "subtitle" ILIKE ${pattern}
      GROUP BY "subtitle"
      ORDER BY cnt DESC
      LIMIT ${limit}
    `;

    // Filter out null/empty and return only subtitle strings
    return rows.map(r => r.subtitle).filter(Boolean);
  }

  async suggestTitles(q: string, limit = 20) {
    if (!q || q.trim().length === 0) return [];
    const pattern = `%${q.trim()}%`;

    const rows: Array<{ title: string; cnt: number }> = await this.prisma.$queryRaw`
      SELECT "title", COUNT(*) AS cnt
      FROM "Destination"
      WHERE "title" ILIKE ${pattern}
      GROUP BY "title"
      ORDER BY cnt DESC
      LIMIT ${limit}
    `;

    return rows.map(r => r.title).filter(Boolean);
  }
}
