// src/modules/experiences/experiences.service.ts
import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { mapExperienceForClient, mapDurationForClient } from './mappers';
import { toPrismaPriceModel } from '@app/utils/price-model';
import type { Prisma } from '@prisma/client';

const MAX_GALLERY_ITEMS = 50;

@Injectable()
export class ExperiencesService {
  private readonly logger = new Logger(ExperiencesService.name);

  constructor(private prisma: PrismaService) {}

  /* ---------- simple fetch helpers (like destinations) ---------- */
  async getAll() {
    return this.prisma.experience.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, slug: true, title: true, excerpt: true, country: true, region: true, lat: true, lng: true, coverImage: true, featured: true },
    });
  }

  async getAllWithDurations() {
    return this.prisma.experience.findMany({
      orderBy: { createdAt: 'desc' },
      include: { durations: true, gallery: { take: 1 } },
    });
  }

  async getFeatured(limit = 10) {
    return this.prisma.experience.findMany({
      where: { featured: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, slug: true, title: true, excerpt: true, country: true, region: true, lat: true, lng: true, coverImage: true, featured: true, gallery: { take: 1, select: { imageUrl: true } } },
    });
  }

  async getFeaturedWithDurations(limit = 10) {
    return this.prisma.experience.findMany({
      where: { featured: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { durations: true },
    });
  }

async getBySlug(slug: string) {
  const ex = await this.prisma.experience.findUnique({
    where: { slug },
    include: {
      durations: { include: { inventories: true } },
      gallery: { orderBy: { order: 'asc' } },
      itineraries: true,
      reviews: { orderBy: { createdAt: 'desc' } },
      blockedDates: true,
    },
  });
  if (!ex) throw new NotFoundException(`Experience not found: ${slug}`);
  return ex;
}


  /* ---------- createExperience (admin) ---------- */
  async createExperience(payload: any) {
    // normalize durations
// normalize durations (for nested create under experience — DO NOT include experienceId)
const durations = (payload.durations || []).map((d: any) => ({
  id: d.id, // optional client-supplied id
  title: d.title,
  days: typeof d.days === 'number' ? d.days : null,
  durationLabel: d.durationLabel ?? null,
  maxNights: d.maxNights ?? null,
  minGuests: d.minGuests ?? null,
  maxGuests: d.maxGuests ?? null,
  priceFrom: d.priceFrom ?? null,
  priceModel: toPrismaPriceModel(d.priceModel as any),
  maxRooms: d.maxRooms ?? null, 
  maxInfants: d.maxInfants ?? null,
  currency: d.currency ?? null,
}));


    // gallery normalization (accept array of strings or objects)
    const incomingGallery: any[] = Array.isArray(payload.gallery) ? payload.gallery : [];
    const galleryNormalized = incomingGallery
      .map((it: any) => {
        if (!it) return null;
        if (typeof it === 'string') return { imageUrl: String(it).trim() };
        return { imageUrl: (it.imageUrl ?? it.url ?? it.src ?? '').toString().trim(), order: it.order ?? 0 };
      })
      .filter((g) => g && g.imageUrl)
      .slice(0, MAX_GALLERY_ITEMS);

    const galleryCreates = galleryNormalized.map((g: any, idx: number) => ({ imageUrl: g.imageUrl, order: g.order ?? idx }));

    const created = await this.prisma.experience.create({
      data: {
        title: payload.title,
        slug: payload.slug,
        excerpt: payload.excerpt,
        overview: payload.overview ?? null,
        country: payload.country,
        region: payload.region,
        featured: payload.featured ?? false,
        lat: payload.lat ?? 0,
        lng: payload.lng ?? 0,
        coverImage: payload.coverImage,
        tags: payload.tags ?? [],
        inclusions: payload.inclusions ?? [],
        exclusions: payload.exclusions ?? [],
        practicalInfo: payload.practicalInfo ?? null,
        host: payload.host ?? null,
        metaTitle: payload.metaTitle ?? null,
        metaDescription: payload.metaDescription ?? null,
        priceFrom: payload.priceFrom ?? null,
        durations: { create: durations },
        ...(galleryCreates.length ? { gallery: { create: galleryCreates } } : {}),
      },
      include: { durations: true, gallery: true },
    });

    return mapExperienceForClient(created);
  }

  /* ---------- updateExperienceBySlug (production-grade) ---------- */
  async updateExperienceBySlug(slug: string, payload: any) {
    const existing = await this.prisma.experience.findUnique({ where: { slug }, select: { id: true } });
    if (!existing) throw new NotFoundException(`Experience not found: ${slug}`);
    const experienceId = existing.id;

    const updateData: any = {
      title: payload.title,
      excerpt: payload.excerpt,
      overview: payload.overview ?? undefined,
      country: payload.country,
      region: payload.region,
      featured: payload.featured ?? undefined,
      lat: payload.lat ?? undefined,
      lng: payload.lng ?? undefined,
      coverImage: payload.coverImage,
      tags: payload.tags ?? undefined,
      inclusions: payload.inclusions ?? undefined,
      exclusions: payload.exclusions ?? undefined,
      practicalInfo: payload.practicalInfo ?? undefined,
      host: payload.host ?? undefined,
      metaTitle: payload.metaTitle ?? undefined,
      metaDescription: payload.metaDescription ?? undefined,
      priceFrom: payload.priceFrom ?? undefined,
    };

    // durations reconcile
    const incomingDurations = payload.durations ?? [];
    const incomingDurationIds = incomingDurations.filter((d:any) => typeof d.id === 'string').map((d:any) => d.id);

    // preload existing durations & gallery
    const [existingDurations, existingGallery] = await Promise.all([
      this.prisma.durationOption.findMany({ where: { experienceId } }),
      this.prisma.gallery.findMany({ where: { experienceId }, select: { id: true, imageUrl: true, order: true } }),
    ]);
    const existingDurationIds = new Set(existingDurations.map((r) => r.id));

    const ops: Prisma.PrismaPromise<any>[] = [];
    ops.push(this.prisma.experience.update({ where: { slug }, data: updateData }));

    // durations removed -> delete
    const toKeepDurationIds = incomingDurationIds.length ? incomingDurationIds : [];
    if (existingDurations.length) {
      const toDelete = existingDurations.map((d) => d.id).filter((id) => !toKeepDurationIds.includes(id));
      if (toDelete.length) ops.push(this.prisma.durationOption.deleteMany({ where: { id: { in: toDelete }, experienceId } }));
    }

    // durations create/update
    for (const d of incomingDurations) {
      const prismaPriceModel = toPrismaPriceModel(d.priceModel as any);
      const common = {
        title: d.title,
        days: d.days ?? null,
        durationLabel: d.durationLabel ?? null,
        maxNights: d.maxNights ?? null,
        minGuests: d.minGuests ?? null,
        maxGuests: d.maxGuests ?? null,
        priceFrom: d.priceFrom ?? null,
        priceModel: prismaPriceModel,
        maxRooms: d.maxRooms ?? null,
        maxInfants: d.maxInfants ?? null,
        currency: d.currency ?? null,
        experienceId,
      };

      if (d.id && existingDurationIds.has(d.id)) {
        ops.push(this.prisma.durationOption.update({ where: { id: d.id }, data: common }));
      } else if (d.id) {
        ops.push(this.prisma.durationOption.create({ data: { ...common, id: d.id } }));
      } else {
        ops.push(this.prisma.durationOption.create({ data: { ...common } }));
      }
    }

    // gallery reconcile (like destinations)
    const incomingGalleryRaw: any[] = Array.isArray(payload.gallery) ? payload.gallery : [];
    const normalizeIncoming = (it: any, idx: number) => {
      if (!it) return null;
      if (typeof it === 'string') return { id: undefined, imageUrl: String(it).trim(), order: idx };
      return {
        id: typeof it.id === 'string' ? it.id : undefined,
        imageUrl: (it.imageUrl ?? it.url ?? it.src ?? '').toString().trim(),
        order: typeof it.order === 'number' ? it.order : idx,
      };
    };
    const incomingNormalized = incomingGalleryRaw.map(normalizeIncoming).filter(Boolean).slice(0, MAX_GALLERY_ITEMS);
    const existingByUrl = new Map(existingGallery.map((r) => [r.imageUrl, r]));
    const existingById = new Map(existingGallery.map((r) => [r.id, r]));

    const galleryCreates: { imageUrl: string; experienceId: string; order: number }[] = [];
    const galleryUpdates: { id: string; data: any }[] = [];
    const seenUrls = new Set<string>();

    for (let i = 0; i < incomingNormalized.length; i++) {
      const item = incomingNormalized[i];
      if (!item) continue;
      const url = item.imageUrl;
      const incomingId = item.id;
      const desiredOrder = item.order ?? i;

      if (seenUrls.has(url)) continue;
      seenUrls.add(url);

      const existingUrlRow = existingByUrl.get(url);
      if (existingUrlRow) {
        if (existingUrlRow.order !== desiredOrder) galleryUpdates.push({ id: existingUrlRow.id, data: { order: desiredOrder } });
        continue;
      }

      if (incomingId && existingById.has(incomingId)) {
        const existing = existingById.get(incomingId)!;
        const updateData: any = {};
        if (existing.imageUrl !== url) updateData.imageUrl = url;
        if (existing.order !== desiredOrder) updateData.order = desiredOrder;
        if (Object.keys(updateData).length) galleryUpdates.push({ id: incomingId, data: updateData });
        existingByUrl.set(url, { id: incomingId, imageUrl: url, order: desiredOrder } as any);
        existingById.set(incomingId, { id: incomingId, imageUrl: url, order: desiredOrder } as any);
        continue;
      }

      galleryCreates.push({ imageUrl: url, experienceId, order: desiredOrder });
    }

    for (const u of galleryUpdates) ops.push(this.prisma.gallery.update({ where: { id: u.id }, data: u.data }));
    if (galleryCreates.length) ops.push(this.prisma.gallery.createMany({ data: galleryCreates, skipDuplicates: true }));

    // execute transaction
    try {
      await this.prisma.$transaction(ops);
    } catch (err: any) {
      this.logger.error('Transaction failed during updateExperienceBySlug; falling back to sequential ops', err);
      // fallback sequential update (best-effort)
      try {
        await this.prisma.experience.update({ where: { slug }, data: updateData });

        // durations fallback
        if (existingDurations.length) {
          const toDelete = existingDurations.map((d) => d.id).filter((id) => !toKeepDurationIds.includes(id));
          if (toDelete.length) await this.prisma.durationOption.deleteMany({ where: { id: { in: toDelete }, experienceId } });
        }
        for (const d of incomingDurations) {
          const prismaPriceModel = toPrismaPriceModel(d.priceModel as any);
          const common = {
            title: d.title,
            days: d.days ?? null,
            durationLabel: d.durationLabel ?? null,
            maxNights: d.maxNights ?? null,
            minGuests: d.minGuests ?? null,
            maxGuests: d.maxGuests ?? null,
            priceFrom: d.priceFrom ?? null,
            priceModel: prismaPriceModel,
            inventory: d.inventory ?? null,
            maxRooms: d.maxRooms ?? null,
            maxInfants: d.maxInfants ?? null,
            currency: d.currency ?? null,
            experienceId,
          };
          if (d.id && existingDurationIds.has(d.id)) await this.prisma.durationOption.update({ where: { id: d.id }, data: common });
          else if (d.id) {
            try { await this.prisma.durationOption.create({ data: { ...common, id: d.id } }); } catch (e) { await this.prisma.durationOption.create({ data: { ...common } }); }
          } else {
            await this.prisma.durationOption.create({ data: { ...common } });
          }
        }

        for (const u of galleryUpdates) { await this.prisma.gallery.update({ where: { id: u.id }, data: u.data }); }
        for (const c of galleryCreates) { try { await this.prisma.gallery.create({ data: c }); } catch (e) { this.logger.warn('gallery create fallback failed', e); } }
      } catch (fallbackErr) {
        this.logger.error('Fallback sequential update failed', fallbackErr);
        throw err;
      }
    }

    const refreshed = await this.prisma.experience.findUnique({
      where: { slug },
      include: {
        durations: { select: { id: true, title: true, days: true, priceFrom: true, currency: true, priceModel: true } },
        gallery: { select: { id: true, imageUrl: true, order: true }, orderBy: { order: 'asc' } },
        itineraries: true,
        reviews: { orderBy: { createdAt: 'desc' } },
        blockedDates: true,
      },
    });

    if (!refreshed) throw new NotFoundException(`Experience not found after update: ${slug}`);
    return mapExperienceForClient(refreshed);
  }

  /* ---------- deleteBySlug (delete by slug or id) ---------- */
  async deleteBySlug(identifier: string) {
    const existing = await this.prisma.experience.findFirst({
      where: { OR: [{ slug: identifier }, { id: identifier }] },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException(`Experience not found: ${identifier}`);
    const experienceId = existing.id;

    const bookingCount = await this.prisma.booking.count({ where: { experienceId } });
    if (bookingCount > 0) throw new BadRequestException(`Cannot delete experience: ${bookingCount} booking(s) exist.`);

    await this.prisma.experience.delete({ where: { id: experienceId } });
    return { deleted: true, identifier };
  }

  async bulkDelete(ids: string[], by: 'id'|'slug' = 'id') {
    if (!ids || !ids.length) return { count: 0 } as Prisma.BatchPayload;
    if (by === 'slug') return this.prisma.experience.deleteMany({ where: { slug: { in: ids } } });
    return this.prisma.experience.deleteMany({ where: { id: { in: ids } } });
  }

  async findBySlugOrId(identifier: string) {
    return this.prisma.experience.findFirst({ where: { OR: [{ slug: identifier }, { id: identifier }] }, select: { id: true } });
  }

  async deleteGalleryById(experienceId: string, galleryId: string) {
    const r = await this.prisma.gallery.deleteMany({ where: { id: galleryId, experienceId } });
    return r.count ?? 0;
  }

  async deleteGalleryByUrl(experienceId: string, imageUrl: string) {
    const r = await this.prisma.gallery.deleteMany({ where: { experienceId, imageUrl } });
    return r.count ?? 0;
  }

  /* ---------- inventory / blocked date helpers (left as-is) ---------- */
// Admin helper: upsert inventory for a durationOption or for all durations of an experience
async upsertInventory(dto: { experienceId?: string; durationOptionId?: string; date: string; capacity: number }) {
  const date = new Date(dto.date + 'T00:00:00Z');
  const capacity = Number(dto.capacity || 0);

  if (!dto.durationOptionId && !dto.experienceId) {
    throw new BadRequestException('durationOptionId or experienceId required');
  }

  // helper to upsert one durationOption's inventory row
  const upsertForDuration = async (durationOptionId: string) => {
    return this.prisma.durationInventory.upsert({
      where: { durationOptionId_date: { durationOptionId, date } as any },
      update: { capacity },
      create: { durationOptionId, date, capacity, booked: 0 },
    });
  };

  if (dto.durationOptionId) {
    await upsertForDuration(dto.durationOptionId);
    return { ok: true, created: 1 };
  }

  // experienceId path: apply to all duration options for that experience
  const durationOpts = await this.prisma.durationOption.findMany({
    where: { experienceId: dto.experienceId },
    select: { id: true },
  });

  if (!durationOpts.length) return { ok: true, created: 0 };

  // run upserts (sequential is fine for small counts; chunk/parallelize for large sets)
  for (const d of durationOpts) {
    await upsertForDuration(d.id);
  }

  return { ok: true, created: durationOpts.length };
}


  async blockDate(dto: { experienceId: string; date: string; reason?: string }) {
    const date = new Date(dto.date + 'T00:00:00Z');
    const existing = await this.prisma.experienceBlockedDate.findUnique({ where: { experienceId_date: { experienceId: dto.experienceId, date } as any } }).catch(()=>null);
    if (existing) return this.prisma.experienceBlockedDate.update({ where: { id: existing.id }, data: { reason: dto.reason ?? null } });
    return this.prisma.experienceBlockedDate.create({ data: { experienceId: dto.experienceId, date, reason: dto.reason ?? null }});
  }

  async unblockDate(experienceId: string, dateIso: string) {
    const date = new Date(dateIso + 'T00:00:00Z');
    const existing = await this.prisma.experienceBlockedDate.findUnique({ where: { experienceId_date: { experienceId, date } as any } }).catch(()=>null);
    if (!existing) throw new NotFoundException('Blocked date not found');
    await this.prisma.experienceBlockedDate.delete({ where: { id: existing.id }});
    return { ok: true };
  }

async getById(id: string) {
  const ex = await this.prisma.experience.findUnique({
    where: { id },
    include: {
      durations: { include: { inventories: true } },
      blockedDates: true,
      gallery: true,
    },
  });
  if (!ex) throw new NotFoundException('Experience not found');
  return ex;
}

}
