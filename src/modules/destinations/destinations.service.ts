// src/modules/destinations/destinations.service.ts
import { Injectable, NotFoundException, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { mapDestinationForClient } from './mappers';

import { Prisma } from '@prisma/client';
import { toPrismaPriceModel } from "../../utils/price-model";


const MAX_GALLERY_ITEMS = 50; // production-safe cap (tweak if needed)

@Injectable()
export class DestinationsService {
  private readonly logger = new Logger(DestinationsService.name);

  constructor(private prisma: PrismaService) {}

  /* ---------- createDestination ---------- */
  async createDestination(payload: any) {

    const safeNum = (v: any) => {
  if (v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
    // normalize durations
const durationsPayload = (payload.durations || []).map((d: any) => ({
  id: typeof d.id === 'string' ? d.id : undefined,
  title: String(d.title ?? ''),
  days: typeof d.days === 'number' ? d.days : (d.days ? Number(d.days) : undefined),
  durationLabel: d.durationLabel ?? undefined,
  maxNights: typeof d.maxNights === 'number' ? d.maxNights : undefined,
  minGuests: typeof d.minGuests === 'number' ? d.minGuests : undefined,
  maxGuests: typeof d.maxGuests === 'number' ? d.maxGuests : undefined,
  priceFrom: typeof d.priceFrom === 'number' ? d.priceFrom : (d.priceFrom ? Number(d.priceFrom) : undefined),
  // PRICE MODEL: if your generated client exposes the enum you can cast to it,
  // otherwise cast to `any` (short term) or run `npx prisma generate`.
  priceModel: toPrismaPriceModel(d.priceModel) as any,
  maxRooms: typeof d.maxRooms === 'number' ? d.maxRooms : undefined,
  maxInfants: typeof d.maxInfants === 'number' ? d.maxInfants : undefined,
  currency: d.currency ?? undefined,
}));

// normalize gallery (keep your existing logic but add explicit types)
const incomingGallery: any[] = Array.isArray(payload.gallery) ? payload.gallery : [];
const galleryNormalized = incomingGallery
  .map((it: any) => {
    if (!it) return null;
    if (typeof it === 'string') return { imageUrl: String(it).trim() };
    return { imageUrl: (it.imageUrl ?? it.url ?? it.src ?? '').toString().trim() };
  })
  .filter(Boolean)
  .slice(0, MAX_GALLERY_ITEMS);

const galleryCreates = galleryNormalized.map((g: any, idx: number) => ({
  imageUrl: g.imageUrl,
  order: idx,
}));

// Build properly typed-ish data — include lat/lng (they are required in your schema)
const data: Prisma.DestinationCreateInput = {
  title: String(payload.title ?? ''),
  slug: String(payload.slug ?? ''),
  // REQUIRED: lat & lng (must be present if model requires them)
  lat: safeNum(payload.lat) ?? 0,   // choose a sensible default or validate earlier
  lng: safeNum(payload.lng) ?? 0,
  // other scalars
  host: payload.host ?? undefined as Prisma.InputJsonValue | undefined,
  coverImage: payload.coverImage ?? undefined,
  country: payload.country ?? undefined,
  region: payload.region ?? undefined,
  featured: Boolean(payload.featured ?? false),
  // nested durations: explicitly create sanitized objects
durations: {
  create: durationsPayload.map((d: any) => ({
    ...(d.id ? { id: d.id } : {}),
    title: d.title,
    ...(typeof d.days !== 'undefined' ? { days: d.days } : {}),
    ...(d.durationLabel ? { durationLabel: d.durationLabel } : {}),
    ...(typeof d.maxNights !== 'undefined' ? { maxNights: d.maxNights } : {}),
    ...(typeof d.minGuests !== 'undefined' ? { minGuests: d.minGuests } : {}),
    ...(typeof d.maxGuests !== 'undefined' ? { maxGuests: d.maxGuests } : {}),
    ...(typeof d.priceFrom !== 'undefined' ? { priceFrom: d.priceFrom } : {}),
    ...(typeof d.priceModel !== 'undefined' ? { priceModel: d.priceModel } : {}),
    ...(typeof d.maxRooms !== 'undefined' ? { maxRooms: d.maxRooms } : {}),
    ...(typeof d.maxInfants !== 'undefined' ? { maxInfants: d.maxInfants } : {}),
    ...(d.currency ? { currency: d.currency } : {}),
  })),
},
  ...(galleryCreates.length ? { gallery: { create: galleryCreates.map(g => ({ imageUrl: g.imageUrl, order: g.order })) } } : {}),
};
    // Use a single create (it's atomic for nested create, but wrapping in a transaction isn't necessary here)
  const created = await this.prisma.$transaction(async (tx) => {
    const dest = await tx.destination.create({
      data,
      include: { durations: true, gallery: true },
    });

  // Now persist inventories per newly created duration (payload still has inventory info)
  const invCreates: { durationOptionId: string; date: Date; capacity: number }[] = [];

  // map incoming durations by some key (client id or title) to created durations
  // if you accept client-supplied d.id and Prisma used it, the created durations will have it
  const createdByClientId = new Map<string, any>();
  for (const cd of dest.durations) {
    if (cd.id) createdByClientId.set(cd.id, cd);
  }

  for (const d of payload.durations || []) {
    // find the created duration row
    const createdRow = (d.id && createdByClientId.get(d.id)) || dest.durations.find((r: any) => r.title === d.title);
    if (!createdRow) continue;

    const rows = Array.isArray(d.inventory) ? d.inventory : [];
    for (const inv of rows) {
      if (!inv || !inv.date) continue;
      invCreates.push({
        durationOptionId: createdRow.id,
        date: new Date(inv.date + "T00:00:00Z"),
        capacity: Number(inv.capacity || 0),
      });
    }
  }

  if (invCreates.length) {
    // use createMany with skipDuplicates (unique constraint prevents duplicates)
    // convert Date to ISO for createMany depending on your connector
    await tx.durationInventory.createMany({
      data: invCreates.map(i => ({ durationOptionId: i.durationOptionId, date: i.date, capacity: i.capacity })),
      skipDuplicates: true,
    });
  }

  return dest;
});

    return mapDestinationForClient(created);
  }

  /* ---------- updateDestinationBySlug (production-grade) ---------- */
  async updateDestinationBySlug(slug: string, payload: any) {
    // 0) ensure destination exists
    const dest = await this.prisma.destination.findUnique({ where: { slug }, select: { id: true } });
    if (!dest) throw new NotFoundException(`Destination not found: ${slug}`);
    const destinationId = dest.id;

    // 1) Prepare base update data

const updateData: any = {
  title: payload.title,
  subtitle: payload.subtitle,
  excerpt: payload.excerpt,
  country: payload.country,
  region: payload.region,
  featured: payload.featured ?? false,
  lat: payload.lat,
  lng: payload.lng,
  coverImage: payload.coverImage,
  tags: payload.tags ?? undefined,
  inclusions: payload.inclusions ?? undefined,
  exclusions: payload.exclusions ?? undefined,
  practicalInfo: payload.practicalInfo ?? undefined,
  metaTitle: payload.metaTitle,
  metaDescription: payload.metaDescription,
};

// <-- Add host only if the client sent it (allows explicit null to clear)
if (payload.host === null) {
  updateData.host = { disconnect: true };
} else if (payload.host?.id) {
  updateData.host = { update: payload.host };
} else {
  updateData.host = {
    upsert: {
      update: payload.host,
      create: payload.host,
    }
  };
}


    // 2) Durations reconcile (normalize incoming)
    const incomingDurations = payload.durations ?? [];
    const incomingDurationIds = incomingDurations.filter((d:any) => typeof d.id === 'string').map((d:any) => d.id);

    // Preload existing durations & gallery to make deterministic decisions
    const [existingDurations, existingGallery] = await Promise.all([
      this.prisma.durationOption.findMany({ where: { destinationId } }),
      this.prisma.gallery.findMany({ where: { destinationId }, select: { id: true, imageUrl: true, order: true } }),
    ]);

    const existingDurationIds = new Set(existingDurations.map((r) => r.id));

    // Build operations array for prisma.$transaction([...ops]) (array style transaction)
    const ops: Prisma.PrismaPromise<any>[] = [];

    // 3) Add base update operation (destination)
    ops.push(this.prisma.destination.update({ where: { slug }, data: updateData }));

    // 4) Durations delete (delete ones the client removed) - deleteMany if there are ids to remove
    const toKeepDurationIds = incomingDurationIds.length ? incomingDurationIds : [];
    if (existingDurations.length) {
      const toDelete = existingDurations.map((d) => d.id).filter((id) => !toKeepDurationIds.includes(id));
      if (toDelete.length) {
        ops.push(this.prisma.durationOption.deleteMany({ where: { id: { in: toDelete }, destinationId } }));
      }
    }

    // 5) Durations create/update ops
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
        inventories: d.inventory
  ? {
      create: d.inventory.map((inv: any) => ({
        date: new Date(inv.date + "T00:00:00Z"),
        capacity: Number(inv.capacity || 0),
      })),
    }
  : undefined,
        maxRooms: d.maxRooms ?? null,
        maxInfants: d.maxInfants ?? null,
        currency: d.currency ?? null,
        destinationId,
      };

      if (d.id && existingDurationIds.has(d.id)) {
        // update existing
        ops.push(this.prisma.durationOption.update({ where: { id: d.id }, data: common }));
      } else if (d.id) {
        // id provided but doesn't exist locally — create with client id if desired (protective)
        // create with given id (Prisma accepts client supplied id), but wrap in try/catch in transaction fallback
        ops.push(this.prisma.durationOption.create({ data: { ...common, id: d.id } }));
      } else {
        // no id -> create
        ops.push(this.prisma.durationOption.create({ data: { ...common } }));
      }
    }
// after you executed ops transaction to update/create durations (or inside same tx)
// assume incomingDurations = payload.durations || [];

await this.prisma.$transaction(async (tx) => {
  // 1) Update destination (already done earlier)
  await tx.destination.update({ where: { slug }, data: updateData });

  // 2) Upsert durations (you may already be doing this). After that, fetch the current durations for this destination:
  const freshDurations = await tx.durationOption.findMany({ where: { destinationId } });

  // Build a map by client id or title to duration id
  const byId = new Map(freshDurations.map(d => [d.id, d]));
  const byTitle = new Map(freshDurations.map(d => [d.title, d]));

  // 3) Now reconcile inventories:
  // For each incoming duration payload, compute desired inventory rows, compare to DB and create/delete as needed.
  for (const d of incomingDurations) {
    const target = (d.id && byId.get(d.id)) ?? byTitle.get(d.title);
    if (!target) continue;

    const desired = Array.isArray(d.inventory) ? d.inventory.map((inv: any) => ({
      date: new Date(inv.date + "T00:00:00Z"),
      capacity: Number(inv.capacity || 0),
    })) : [];

    // fetch existing inventory for this duration
    const existing = await tx.durationInventory.findMany({
      where: { durationOptionId: target.id },
      select: { id: true, date: true, capacity: true },
    });

    const existingByDate = new Map(existing.map(e => [e.date.toISOString().slice(0,10), e]));

    // build lists
    const toCreate = [];
    const toUpdate = [];
const desiredByDate = new Map<string, { date: Date; capacity: number }>(
  desired.map((x: any) => [x.date.toISOString().slice(0,10), x])
);
    // create or update
    for (const [dateKey, inv] of desiredByDate) {
      const ex = existingByDate.get(dateKey);
      if (!ex) {
        toCreate.push({ durationOptionId: target.id, date: new Date(dateKey + "T00:00:00Z"), capacity: inv.capacity });
      } else if (ex.capacity !== inv.capacity) {
        toUpdate.push({ id: ex.id, capacity: inv.capacity });
      }
    }

    // deletes: any existing date not present in desired set -> delete
    const toDeleteIds = existing.filter(e => !desiredByDate.has(e.date.toISOString().slice(0,10))).map(e => e.id);

    if (toCreate.length) {
      await tx.durationInventory.createMany({ data: toCreate, skipDuplicates: true });
    }
    for (const u of toUpdate) {
      await tx.durationInventory.update({ where: { id: u.id }, data: { capacity: u.capacity } });
    }
    if (toDeleteIds.length) {
      await tx.durationInventory.deleteMany({ where: { id: { in: toDeleteIds } } });
    }
  }
});

    // 6) Gallery reconcile (non-destructive) - process incoming gallery
const incomingGalleryRaw: any[] = Array.isArray(payload.gallery) ? payload.gallery : [];
const incomingGalleryArray = incomingGalleryRaw;

    const normalizeIncoming = (it: any, idx: number) => {
      if (!it) return null;
      if (typeof it === 'string') return { id: undefined, imageUrl: String(it).trim(), order: idx };
      return {
        id: typeof it.id === 'string' ? it.id : undefined,
        imageUrl: (it.imageUrl ?? it.url ?? it.src ?? '').toString().trim(),
        order: typeof it.order === 'number' ? it.order : idx,
      };
    };

    const incomingNormalized = incomingGalleryArray
      .map(normalizeIncoming)
      .filter((x) => x && x.imageUrl)
      .slice(0, MAX_GALLERY_ITEMS);

    // Build existing maps
    const existingByUrl = new Map(existingGallery.map((r) => [r.imageUrl, r]));
    const existingById = new Map(existingGallery.map((r) => [r.id, r]));

    // We'll collect createMany payloads separately and individual updates separately
    const galleryCreates: { imageUrl: string; destinationId: string; order: number }[] = [];
    const galleryUpdates: { id: string; data: { imageUrl?: string; order?: number } }[] = [];
    const seenUrls = new Set<string>();

    for (let i = 0; i < incomingNormalized.length; i++) {
      const item = incomingNormalized[i];
      if (!item) continue;
      const url = item.imageUrl;
      const incomingId = item.id;
      const desiredOrder = item.order ?? i;

      if (seenUrls.has(url)) continue; // dedupe within payload
      seenUrls.add(url);

      // 1) if existing by url -> update order if needed
      const existingUrlRow = existingByUrl.get(url);
      if (existingUrlRow) {
        if (existingUrlRow.order !== desiredOrder) {
          galleryUpdates.push({ id: existingUrlRow.id, data: { order: desiredOrder } });
        }
        continue;
      }

      // 2) if incomingId refers to an existing row (id belongs to this destination)
      if (incomingId && existingById.has(incomingId)) {
        const existing = existingById.get(incomingId)!;
        const updateData: any = {};
        if (existing.imageUrl !== url) updateData.imageUrl = url;
        if (existing.order !== desiredOrder) updateData.order = desiredOrder;
        if (Object.keys(updateData).length) {
          galleryUpdates.push({ id: incomingId, data: updateData });
        }
        // reflect in maps
        existingByUrl.set(url, { id: incomingId, imageUrl: url, order: desiredOrder } as any);
        existingById.set(incomingId, { id: incomingId, imageUrl: url, order: desiredOrder } as any);
        continue;
      }

      // 3) create new gallery row
      galleryCreates.push({ imageUrl: url, destinationId, order: desiredOrder });
      // note: we don't reflect created id in existingById until transaction completes
    }

    // Convert update ops into prisma promises
    for (const u of galleryUpdates) {
      ops.push(this.prisma.gallery.update({ where: { id: u.id }, data: u.data }));
    }

    // Add createMany for new gallery rows (efficient). If createMany not supported in your DB connector for nested create, fallback to individual creates.
    if (galleryCreates.length) {
      // Prisma createMany does not return created rows; we can still use it for performance
      // but some DBs (SQLite) have limitations — wrap with try/catch in outer transaction attempt
      ops.push(this.prisma.gallery.createMany({ data: galleryCreates, skipDuplicates: true }));
    }

    // 7) Execute transaction with batched ops array
    try {
      await this.prisma.$transaction(ops);
    } catch (err: any) {
      // If we get a Prisma transaction not found / closed error (P2028) or other transaction failure,
      // attempt a best-effort fallback: run operations sequentially (non-atomic) to avoid leaving user-facing error.
      this.logger.error('Transaction failed during updateDestinationBySlug; falling back to sequential ops', err);
      if (err?.code === 'P2028' || err?.name === 'PrismaClientKnownRequestError') {
        try {
          // Sequential fallback: perform updates one-by-one (best-effort)
          // 1) destination update
          await this.prisma.destination.update({ where: { slug }, data: updateData });

          // 2) durations: delete removed, then upsert/create
          if (existingDurations.length) {
            const toDelete = existingDurations.map((d) => d.id).filter((id) => !toKeepDurationIds.includes(id));
            if (toDelete.length) await this.prisma.durationOption.deleteMany({ where: { id: { in: toDelete }, destinationId } });
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
              inventories: d.inventory
  ? {
      create: d.inventory.map((inv: any) => ({
        date: new Date(inv.date + "T00:00:00Z"),
        capacity: Number(inv.capacity || 0),
      })),
    }
  : undefined,
              maxRooms: d.maxRooms ?? null,
              maxInfants: d.maxInfants ?? null,
              currency: d.currency ?? null,
              destinationId,
            };
            if (d.id && existingDurationIds.has(d.id)) {
              await this.prisma.durationOption.update({ where: { id: d.id }, data: common });
            } else if (d.id) {
              try { await this.prisma.durationOption.create({ data: { ...common, id: d.id } }); } catch (e) { await this.prisma.durationOption.create({ data: { ...common } }); }
            } else {
              await this.prisma.durationOption.create({ data: { ...common } });
            }
          }

          // 3) gallery updates
          for (const u of galleryUpdates) {
            await this.prisma.gallery.update({ where: { id: u.id }, data: u.data });
          }
          for (const c of galleryCreates) {
            try { await this.prisma.gallery.create({ data: c }); } catch (e) { this.logger.warn('gallery create fallback failed', e); }
          }
        } catch (fallbackErr) {
          this.logger.error('Fallback sequential update failed', fallbackErr);
          // rethrow original transaction error (wrapped) so controller surfaces failure
          throw err;
        }
      } else {
        // not a transaction issue we expected — rethrow
        throw err;
      }
    }

    // 8) Return fresh destination
    const refreshed = await this.prisma.destination.findUnique({
      where: { slug },
      include: {
        durations: {
          select: {
            id: true,
            title: true,
            days: true,
            priceFrom: true,
            currency: true,
            priceModel: true,
          },
        },
        gallery: {
          select: { id: true, imageUrl: true, order: true },
          orderBy: { order: 'asc' },
        },
        itineraries: {
          select: {
            id: true,
            day: true,
            time: true,
            title: true,
            description: true,
            durationMinutes: true,
            applicableDurations: true,
            mealIncluded: true,
          },
        },
        reviews: {
          select: {
            id: true,
            author: true,
            avatar: true,
            rating: true,
            text: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!refreshed) throw new NotFoundException(`Destination not found after update: ${slug}`);
    return mapDestinationForClient(refreshed);
  }

  /* ---------- other helpers (unchanged) ---------- */
  
  async getAll() {
    return this.prisma.destination.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        slug: true,
        title: true,
        subtitle: true,
        excerpt: true,
        country: true,
        region: true,
        lat: true,
        lng: true,
        coverImage: true,
        featured: true,
      },
    });
  }

  async getAllWithDurations() {
    return this.prisma.destination.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        durations: {
          select: {
            id: true,
            title: true,
            days: true,
            priceFrom: true,
            currency: true,
            priceModel: true,
          },
        },
      },
    });
  }

  async getFeatured(limit = 10) {
    return this.prisma.destination.findMany({
      where: { featured: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        slug: true,
        title: true,
        subtitle: true,
        excerpt: true,
        country: true,
        region: true,
        lat: true,
        lng: true,
        coverImage: true,
        featured: true,
        gallery: { take: 1, select: { imageUrl: true, order: true } },
      },
    });
  }

  async getFeaturedWithDurations(limit = 10) {
    return this.prisma.destination.findMany({
      where: { featured: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        durations: {
          select: {
            id: true,
            title: true,
            days: true,
            priceFrom: true,
            currency: true,
            priceModel: true,
          },
        },
      },
    });
  }

async getBySlug(slug: string) {
  return this.prisma.destination.findUnique({
    where: { slug },
    include: {
      durations: {
        select: {
          id: true,
          title: true,
          days: true,
          priceFrom: true,
          currency: true,
          priceModel: true,
        },
      },
      gallery: {
        select: { id: true, imageUrl: true, order: true },
        orderBy: { order: 'asc' },
      },
      itineraries: {
        select: {
          id: true,
          day: true,
          time: true,
          title: true,
          description: true,
          durationMinutes: true,
          applicableDurations: true,
          mealIncluded: true,
        },
      },
      reviews: {
        select: {
          id: true,
          author: true,
          avatar: true,
          rating: true,
          text: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      },
      host: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          avatar: true,
          about: true,
        },
      },
    },
  }); // <-- missing comma and closing parenthesis added
}

/**
 * Delete a destination by slug OR id.
 * - First attempts to delete by slug (backwards-compatible)
 * - If not found, attempts to delete by id
 * - Throws NotFoundException if still not found
 */
async deleteBySlug(identifier: string) {
  const existing = await this.prisma.destination.findFirst({
    where: { OR: [{ slug: identifier }, { id: identifier }] },
    select: { id: true },
  });

  if (!existing) throw new NotFoundException(`Destination not found: ${identifier}`);

  const destinationId = existing.id;

  const bookingCount = await this.prisma.booking.count({ where: { destinationId } });
  if (bookingCount > 0) {
    throw new BadRequestException(`Cannot delete destination: ${bookingCount} booking(s) exist.`);
  }

  // With cascades in place, this will remove gallery/durations/itineraries/reviews automatically
  await this.prisma.destination.delete({ where: { id: destinationId } });

  return { deleted: true, identifier };
}


/**
 * Bulk delete by id or slug.
 * - `by` can be 'id' or 'slug'
 * - returns Prisma.BatchPayload ({ count: number })
 */
async bulkDelete(ids: string[], by: 'id' | 'slug' = 'id'): Promise<Prisma.BatchPayload> {
  if (!ids || !ids.length) {
    // return a shape compatible with Prisma.BatchPayload
    return { count: 0 } as Prisma.BatchPayload;
  }

  if (by === 'slug') {
    return this.prisma.destination.deleteMany({
      where: { slug: { in: ids } },
    });
  }

  // default: delete by id
  return this.prisma.destination.deleteMany({
    where: { id: { in: ids } },
  });
}
async findBySlugOrId(identifier: string) {
  return this.prisma.destination.findFirst({
    where: { OR: [{ slug: identifier }, { id: identifier }] },
    select: { id: true },
  });
}
/**
 * Delete a gallery row by id (returns number deleted)
 */
async deleteGalleryById(destinationId: string, galleryId: string) {
  const r = await this.prisma.gallery.deleteMany({
    where: { id: galleryId, destinationId },
  });
  return r.count ?? 0;
}

/**
 * Delete gallery rows by imageUrl (returns number deleted)
 */
async deleteGalleryByUrl(destinationId: string, imageUrl: string) {
  const r = await this.prisma.gallery.deleteMany({
    where: { destinationId, imageUrl },
  });
  return r.count ?? 0;
}
async findNearby(
  slug: string,
  radiusKm = 5,
  opts: { limit?: number; minResults?: number } = {},
) {
  const MAX_RADIUS_KM = 200; // safety cap
  const MAX_LIMIT = 50;

  const limit = Math.min(Math.max(1, Number(opts.limit ?? 10)), MAX_LIMIT);
  const radius = Math.min(Math.max(0.1, Number(radiusKm || 0.1)), MAX_RADIUS_KM);

  const src = await this.prisma.destination.findUnique({
    where: { slug },
    select: { id: true, lat: true, lng: true, title: true },
  });

  if (!src || typeof src.lat !== 'number' || typeof src.lng !== 'number') {
    this.logger.debug(`findNearby: source missing lat/lng for slug=${slug}`);
    return [];
  }

  const srcLat = Number(src.lat);
  const srcLng = Number(src.lng);

  const kmPerDegLat = 111.32;
  const deltaLat = radius / kmPerDegLat;
  const cosLat = Math.cos((srcLat * Math.PI) / 180);
  const kmPerDegLng = Math.max(0.000001, kmPerDegLat * cosLat);
  const deltaLng = radius / kmPerDegLng;

  const minLat = srcLat - deltaLat;
  const maxLat = srcLat + deltaLat;
  const minLng = srcLng - deltaLng;
  const maxLng = srcLng + deltaLng;

  // Query candidates with bounding box excluding the source.
  // Numeric comparisons (gte/lte) already exclude NULL values in SQL, so extra NOT checks are unnecessary.
  const candidates = await this.prisma.destination.findMany({
    where: {
      slug: { not: slug },
      lat: { gte: minLat, lte: maxLat },
      lng: { gte: minLng, lte: maxLng },
    },
    select: {
      id: true,
      slug: true,
      title: true,
      subtitle: true,
      excerpt: true,
      country: true,
      region: true,
      coverImage: true,
      lat: true,
      lng: true,
      rating: true,
      reviewCount: true,
    },
  });

  if (!candidates || candidates.length === 0) return [];

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const withDist = candidates
    .map((c) => {
      const lat = Number(c.lat ?? NaN);
      const lng = Number(c.lng ?? NaN);
      if (!isFinite(lat) || !isFinite(lng)) return null;
      const d = haversineKm(srcLat, srcLng, lat, lng);
      return { ...c, distanceKm: Math.round(d * 100) / 100 };
    })
    .filter((c) => c !== null && (c as any).distanceKm <= radius)
    .sort((a: any, b: any) => a.distanceKm - b.distanceKm)
    .slice(0, limit);

  const result = withDist.map((c: any) => ({
    id: c.id,
    slug: c.slug,
    title: c.title,
    subtitle: c.subtitle,
    excerpt: c.excerpt,
    country: c.country,
    region: c.region,
    coverImage: c.coverImage,
    rating: c.rating ?? null,
    reviewCount: c.reviewCount ?? 0,
    distanceKm: c.distanceKm,
  }));

  return result;
}

}
