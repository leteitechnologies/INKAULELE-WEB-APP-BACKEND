import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import * as crypto from 'crypto';
import { CheckAvailabilityDto } from './dtos/check-availability.dto';
import { ClientPriceModel, fromPrismaPriceModel } from '@app/utils/price-model';
import { Prisma } from '@prisma/client';
const HOLD_TTL_SECONDS = Number(process.env.AVAILABILITY_HOLD_TTL_SECONDS || 15 * 60);
const DEFAULT_PRICE_MODEL = 'per_person';

@Injectable()
export class AvailabilityService {
  constructor(private prisma: PrismaService) {}

  private sha256(input: string) {
    return crypto.createHash('sha256').update(input).digest('hex');
  }
  private genToken(): string {
    return crypto.randomBytes(24).toString('hex');
  }
  private parseDateOnly(dateStr: string): Date {
    const d = new Date(dateStr + 'T00:00:00Z');
    if (Number.isNaN(d.getTime())) throw new BadRequestException('Invalid date format');
    return d;
  }
  private eachNight(from: Date, to: Date): Date[] {
    const res: Date[] = [];
    const cur = new Date(from);
    while (cur < to) {
      res.push(new Date(cur));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return res;
  }
  private nightsBetween(from: Date, to: Date): number {
    const msPerDay = 1000 * 60 * 60 * 24;
    const diffDays = Math.ceil((to.getTime() - from.getTime()) / msPerDay);
    return diffDays > 0 ? diffDays : 0;
  }

  /**
   * checkAvailability (production-grade per-date inventory & blocked-date aware)
   */
  async checkAvailability(dto: CheckAvailabilityDto) {
    const { destinationId, experienceId, durationOptionId, from, to, guests, createHold } = dto;

    const fromDate = this.parseDateOnly(from);
    const toDate = this.parseDateOnly(to);
    if (toDate <= fromDate) throw new BadRequestException('`to` must be after `from`');

    const nights = this.nightsBetween(fromDate, toDate);
    if (nights <= 0) throw new BadRequestException('Invalid date range');

    // Load resource(s)
    let dest = null;
    if (destinationId) {
      dest = await this.prisma.destination.findUnique({ where: { id: destinationId } });
      if (!dest) throw new BadRequestException('Destination not found');
    }

    let experience = null;
    if (experienceId) {
      experience = await this.prisma.experience.findUnique({ where: { id: experienceId }});
      if (!experience) throw new BadRequestException('Experience not found');
    }

    // duration option (optional)
    let durationOption = null;
    if (durationOptionId) {
      durationOption = await this.prisma.durationOption.findUnique({ where: { id: durationOptionId }});
      if (!durationOption) throw new BadRequestException('Duration option not found');
    } else if (destinationId) {
      durationOption = await this.prisma.durationOption.findFirst({ where: { destinationId }, orderBy: { createdAt: 'asc' }});
    } else if (experienceId) {
      durationOption = await this.prisma.durationOption.findFirst({ where: { experienceId }, orderBy: { createdAt: 'asc' }});
    }

    // validate guests & rooms constraints
    const totalGuests = (guests?.adults ?? 0) + (guests?.children ?? 0);
    if ((durationOption?.minGuests ?? 1) > totalGuests) {
      return { available: false, message: `Minimum ${(durationOption?.minGuests ?? 1)} guest(s) required` };
    }
    if (typeof durationOption?.maxGuests === 'number' && totalGuests > durationOption.maxGuests) {
      return { available: false, message: `Maximum ${durationOption.maxGuests} guest(s) allowed`};
    }
    if (durationOption?.maxInfants != null && (guests?.infants ?? 0) > durationOption.maxInfants) {
      return { available: false, message: `Maximum ${durationOption.maxInfants} infant(s) allowed`};
    }
    const roomsRequested = guests?.rooms ?? 1;
    if (durationOption?.maxRooms != null && roomsRequested > durationOption.maxRooms) {
      return { available: false, message: `Maximum ${durationOption.maxRooms} room(s) allowed for this package`};
    }
    const unitsRequested = (roomsRequested && roomsRequested > 0) ? roomsRequested : 1;

    // price calc
    const rawModel = durationOption?.priceModel;
    const priceModel: ClientPriceModel = fromPrismaPriceModel(rawModel) ?? DEFAULT_PRICE_MODEL;
    const priceFrom = durationOption?.priceFrom ?? 0;
    let totalPrice = 0;
    switch (priceModel) {
      case 'per_person': totalPrice = priceFrom * totalGuests * nights; break;
      case 'per_room': totalPrice = priceFrom * unitsRequested * nights; break;
      case 'per_booking':
      default: totalPrice = priceFrom; break;
    }
    const destCurrency =
      (dest?.practicalInfo && typeof dest.practicalInfo === 'object' && !Array.isArray(dest.practicalInfo))
        ? (dest.practicalInfo as Record<string, any>)?.currency
        : undefined;
    const currency = durationOption?.currency ?? destCurrency ?? 'USD';

    // Build per-night array
    const nightsArr = this.eachNight(fromDate, toDate); // length == nights

    // === Query per-date inventory ===
    // We'll support per-date inventory for both Experience (experienceInventory) and Destination (destinationInventory).
    let inventoryByDate = new Map<string, number>(); // yyyy-mm-dd -> capacity

if (experienceId) {
  const invRows = await this.prisma.durationInventory.findMany({
    where: {
      date: { gte: fromDate, lt: toDate },
      durationOption: { experienceId }, // filter via relation
    },
    include: { durationOption: { select: { id: true } } },
  });

  for (const r of invRows) {
    const key = r.date.toISOString().slice(0,10);
    // sum capacities across duration options so we get a single capacity per date
    const prev = inventoryByDate.get(key) ?? 0;
    inventoryByDate.set(key, prev + r.capacity);
  }
} else if (destinationId) {
  const invRows = await this.prisma.durationInventory.findMany({
    where: {
      date: { gte: fromDate, lt: toDate },
      durationOption: { destinationId }, // filter via relation
    },
    include: { durationOption: { select: { id: true } } },
  });

  for (const r of invRows) {
    const key = r.date.toISOString().slice(0,10);
    const prev = inventoryByDate.get(key) ?? 0;
    inventoryByDate.set(key, prev + r.capacity);
  }
}


    // Query blocked dates (experience)
    const blockedByDate = new Set<string>();
    if (experienceId) {
      const blocked = await this.prisma.experienceBlockedDate.findMany({
        where: { experienceId, date: { gte: fromDate, lt: toDate } },
      });
      for (const b of blocked) blockedByDate.add(b.date.toISOString().slice(0,10));
    }

    // Query overlapping bookings for the resource (destination OR experience)
    const now = new Date();
    const bookingWhere: any = {
      AND: [
        { NOT: [{ toDate: { lte: fromDate } }, { fromDate: { gte: toDate } }] },
        { OR: [
            { status: 'CONFIRMED' },
            { status: 'HOLD', holdExpiresAt: { gt: now } }, // active holds
          ] },
      ],
    };
    if (experienceId) bookingWhere.AND.push({ experienceId });
    else bookingWhere.AND.push({ destinationId });

    const overlappingBookings = await this.prisma.booking.findMany({
      where: bookingWhere,
      select: { id: true, fromDate: true, toDate: true, unitsBooked: true, rooms: true, status: true, holdExpiresAt: true },
    });

    // Expand each booking into nights in-memory -> build date->bookedUnits
    const bookedUnitsByDate = new Map<string, number>();
    for (const b of overlappingBookings) {
      const bFrom = new Date(b.fromDate);
      const bTo = new Date(b.toDate);
      const cur = new Date(bFrom);
      while (cur < bTo) {
        if (cur >= fromDate && cur < toDate) {
          const key = cur.toISOString().slice(0,10);
          const prev = bookedUnitsByDate.get(key) ?? 0;
          bookedUnitsByDate.set(key, prev + (b.unitsBooked ?? (b.rooms ?? 1) ?? 1));
        }
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
    }

    // Evaluate per date capacity
    for (const d of nightsArr) {
      const key = d.toISOString().slice(0,10);

      // Blocked dates check (experience)
      if (blockedByDate.has(key)) {
        return { available: false, message: `Not available: ${key} is blocked` };
      }

      // capacity: prefer per-date override, then durationOption.inventory, else unlimited
      const perDateCapacity = inventoryByDate.has(key)
        ? inventoryByDate.get(key)!
        : null;
      if (perDateCapacity == null) {
        // unlimited for this date -> OK
        continue;
      }

      const bookedForDate = bookedUnitsByDate.get(key) ?? 0;
      const remaining = perDateCapacity - bookedForDate;
      if (remaining < unitsRequested) {
        return {
          available: false,
          message:
            perDateCapacity <= 0
              ? `Not available: ${key} has no capacity`
              : `Only ${Math.max(0, remaining)} left on ${key}`,
          details: { date: key, capacity: perDateCapacity, booked: bookedForDate, remaining },
        };
      }
    }

    // If we get here, all nights are available. Optionally create hold inside a transaction (serialize via FOR UPDATE)
    try {
  const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // lock the resource row - choose experience or destination
        if (experienceId) {
          await tx.$executeRaw`SELECT id FROM "Experience" WHERE id = ${experienceId} FOR UPDATE`;
        } else {
          await tx.$executeRaw`SELECT id FROM "Destination" WHERE id = ${destinationId} FOR UPDATE`;
        }

        // Recompute overlapping bookings inside the transaction
        const nowTx = new Date();
        const bookingWhereTx: any = {
          AND: [
            { NOT: [{ toDate: { lte: fromDate } }, { fromDate: { gte: toDate } }] },
            { OR: [
                { status: 'CONFIRMED' },
                { status: 'HOLD', holdExpiresAt: { gt: nowTx } },
              ] },
          ],
        };
        if (experienceId) bookingWhereTx.AND.push({ experienceId });
        else bookingWhereTx.AND.push({ destinationId });

        const overlappingTx = await tx.booking.findMany({
          where: bookingWhereTx,
          select: { fromDate: true, toDate: true, unitsBooked: true, rooms: true },
        });

        // in-memory recompute map
        const bookedUnitsByDateTx = new Map<string, number>();
        for (const b of overlappingTx) {
          const bFrom = new Date(b.fromDate);
          const bTo = new Date(b.toDate);
          const cur = new Date(bFrom);
          while (cur < bTo) {
            if (cur >= fromDate && cur < toDate) {
              const key = cur.toISOString().slice(0,10);
              const prev = bookedUnitsByDateTx.get(key) ?? 0;
              bookedUnitsByDateTx.set(key, prev + (b.unitsBooked ?? (b.rooms ?? 1) ?? 1));
            }
            cur.setUTCDate(cur.getUTCDate() + 1);
          }
        }

        // reload inventoryByDateTx inside tx (if experience OR destination)
        const inventoryByDateTx = new Map<string, number>();
  if (experienceId) {
  const invRowsTx = await tx.durationInventory.findMany({
    where: {
      date: { gte: fromDate, lt: toDate },
      durationOption: { experienceId },
    },
    include: { durationOption: { select: { id: true } } },
  });
  for (const r of invRowsTx) inventoryByDateTx.set(r.date.toISOString().slice(0,10), (inventoryByDateTx.get(r.date.toISOString().slice(0,10)) ?? 0) + r.capacity);
} else if (destinationId) {
  const invRowsTx = await tx.durationInventory.findMany({
    where: {
      date: { gte: fromDate, lt: toDate },
      durationOption: { destinationId },
    },
    include: { durationOption: { select: { id: true } } },
  });
  for (const r of invRowsTx) inventoryByDateTx.set(r.date.toISOString().slice(0,10), (inventoryByDateTx.get(r.date.toISOString().slice(0,10)) ?? 0) + r.capacity);
}


        // re-evaluate per-date capacity with transaction data
        for (const d of nightsArr) {
          const key = d.toISOString().slice(0,10);
          if (experienceId) {
            const blocked = await tx.experienceBlockedDate.findFirst({ where: { experienceId, date: d } });
            if (blocked) throw new BadRequestException(`Not available: ${key} is blocked`);
          }

          const perDateCapacity = inventoryByDateTx.has(key)
            ? inventoryByDateTx.get(key)!
            : null;
          if (perDateCapacity == null) continue;

          const bookedForDate = bookedUnitsByDateTx.get(key) ?? 0;
          const remaining = perDateCapacity - bookedForDate;
          if (remaining < unitsRequested) {
            throw new BadRequestException(perDateCapacity <= 0 ? `Not available: ${key} has no capacity` : `Only ${Math.max(0, remaining)} left on ${key}`);
          }
        }

        // All good; create HOLD if requested
        let holdTokenRaw: string | undefined;
        let holdExpiresAt: Date | undefined;
        let createdBooking: any = null;

        if (createHold) {
          holdTokenRaw = this.genToken();
          const holdHash = this.sha256(holdTokenRaw);
          holdExpiresAt = new Date(Date.now() + HOLD_TTL_SECONDS * 1000);

          createdBooking = await tx.booking.create({
            data: {
              destinationId: destinationId ?? null,
              experienceId: experienceId ?? null,
              durationOptionId: durationOption?.id ?? null,
              fromDate,
              toDate,
              nights,
              adults: guests?.adults ?? 0,
              children: guests?.children ?? 0,
              infants: guests?.infants ?? 0,
              rooms: roomsRequested,
              unitsBooked: unitsRequested,
              totalPrice,
              currency,
              status: 'HOLD',
              holdTokenHash: holdHash,
              holdExpiresAt,
            },
          });
        }

        return {
          available: true,
          nights,
          totalPrice,
          currency,
          message: 'Available',
          holdToken: holdTokenRaw,
          holdExpiresAt: holdExpiresAt?.toISOString(),
          bookingId: createdBooking?.id ?? null,
        };
      }, { isolationLevel: 'Serializable' });

      return result;
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      console.error('Availability check transaction failed', err);
      throw new InternalServerErrorException('Availability check failed. Please try again.');
    }
  }

  async confirmHold(bookingId?: string, holdToken?: string, paymentInfo?: any) {
    if (!bookingId && !holdToken) throw new BadRequestException('bookingId or holdToken required');

    const now = new Date();
    const booking = bookingId
      ? await this.prisma.booking.findUnique({ where: { id: bookingId } })
      : await this.prisma.booking.findFirst({ where: { holdTokenHash: this.sha256(holdToken!), status: 'HOLD' }});

    if (!booking) throw new BadRequestException('Hold not found');

    if (booking.status !== 'HOLD' || (booking.holdExpiresAt && booking.holdExpiresAt <= now)) {
      throw new BadRequestException('Hold expired or not active');
    }

    try {
   const confirmed = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.$executeRaw`SELECT id FROM "Destination" WHERE id = ${booking.destinationId} FOR UPDATE`;

        return tx.booking.update({
          where: { id: booking.id },
          data: {
            status: 'CONFIRMED',
            holdTokenHash: null,
            holdExpiresAt: null,
            stripePaymentIntentId: paymentInfo?.intentId ?? undefined,
            stripePaymentIntentStatus: paymentInfo?.status ?? undefined,
          },
        });
      }, { isolationLevel: 'Serializable'});

      return { success: true, booking: confirmed };
    } catch (err) {
      throw new InternalServerErrorException('Could not confirm booking');
    }
  }

  async releaseHold(bookingId?: string, holdToken?: string) {
    if (!bookingId && !holdToken) throw new BadRequestException('bookingId or holdToken required');
    const booking = bookingId
      ? await this.prisma.booking.findUnique({ where: { id: bookingId } })
      : await this.prisma.booking.findFirst({ where: { holdTokenHash: this.sha256(holdToken!), status: 'HOLD' }});
    if (!booking) return { released: false };

    await this.prisma.booking.update({
      where: { id: booking.id },
      data: { status: 'EXPIRED', holdTokenHash: null, holdExpiresAt: null },
    });
    return { released: true };
  }

  // Admin helpers
// inside AvailabilityService class

private chunk<T>(arr: T[], size = 150): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Upsert inventory for a single durationOption (chunked)
 */
private async upsertInventoryForDuration(
  prisma: PrismaService,
  durationOptionId: string,
  items: { date: string; capacity: number }[],
) {
  if (!durationOptionId) throw new BadRequestException('durationOptionId required');
  if (!Array.isArray(items) || items.length === 0) return;

  const ops = items.map(it => {
    const d = new Date(it.date + 'T00:00:00Z');
    return prisma.durationInventory.upsert({
      where: { durationOptionId_date: { durationOptionId, date: d } },
      update: { capacity: it.capacity },
      create: { durationOptionId, date: d, capacity: it.capacity },
    });
  });

  const chunks = this.chunk(ops, 120);
  for (const c of chunks) {
    await prisma.$transaction(c);
  }
}

/**
 * Upsert inventory for an experience: applies items to every durationOption of that experience
 */
async upsertExperienceInventory(experienceId: string, items: { date: string; capacity: number }[]) {
  if (!experienceId) throw new BadRequestException('experienceId required');
  if (!Array.isArray(items) || items.length === 0) return { ok: true };

  const durationOpts = await this.prisma.durationOption.findMany({
    where: { experienceId },
    select: { id: true },
  });

  if (!durationOpts.length) return { ok: true, created: 0 };

  let createdCount = 0;
  for (const dOpt of durationOpts) {
    await this.upsertInventoryForDuration(this.prisma, dOpt.id, items);
    createdCount += items.length;
  }

  return { ok: true, created: createdCount };
}

/**
 * Upsert inventory for a destination: applies items to every durationOption of that destination
 */
async upsertDestinationInventory(destinationId: string, items: { date: string; capacity: number }[]) {
  if (!destinationId) throw new BadRequestException('destinationId required');
  if (!Array.isArray(items) || items.length === 0) return { ok: true };

  const durationOpts = await this.prisma.durationOption.findMany({
    where: { destinationId },
    select: { id: true },
  });

  if (!durationOpts.length) return { ok: true, created: 0 };

  let createdCount = 0;
  for (const dOpt of durationOpts) {
    await this.upsertInventoryForDuration(this.prisma, dOpt.id, items);
    createdCount += items.length;
  }

  return { ok: true, created: createdCount };
}

  async generateInventoryRange(
  destinationId?: string,
  experienceId?: string,
  from?: string,
  to?: string,
  capacity?: number,
) {
  if (!destinationId && !experienceId)
    throw new BadRequestException('destinationId or experienceId required');
  if (!from || !to)
    throw new BadRequestException('`from` and `to` dates required');
  if (!capacity || capacity <= 0)
    throw new BadRequestException('Invalid capacity');

  const fromDate = new Date(from + 'T00:00:00Z');
  const toDate = new Date(to + 'T00:00:00Z');
  if (toDate <= fromDate) throw new BadRequestException('`to` must be after `from`');

  const items: { date: string; capacity: number }[] = [];
  const current = new Date(fromDate);
  while (current < toDate) {
    items.push({ date: current.toISOString().slice(0, 10), capacity });
    current.setUTCDate(current.getUTCDate() + 1);
  }

  if (destinationId) {
    await this.upsertDestinationInventory(destinationId, items);
  } else if (experienceId) {
    await this.upsertExperienceInventory(experienceId, items);
  }

  return { ok: true, created: items.length };
}

}
