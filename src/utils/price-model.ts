// src/utils/price-model.ts
export type ClientPriceModel = 'per_person' | 'per_room' | 'per_booking';
export type PrismaPriceModel = 'PER_PERSON' | 'PER_ROOM' | 'PER_BOOKING' | null;

const TO_PRISMA: Record<ClientPriceModel, Exclude<PrismaPriceModel, null>> = {
  per_person: 'PER_PERSON',
  per_room: 'PER_ROOM',
  per_booking: 'PER_BOOKING',
};

const FROM_PRISMA: Record<Exclude<PrismaPriceModel, null>, ClientPriceModel> = {
  PER_PERSON: 'per_person',
  PER_ROOM: 'per_room',
  PER_BOOKING: 'per_booking',
};

export function toPrismaPriceModel(v?: ClientPriceModel | null): PrismaPriceModel {
  if (v == null) return null;
  return TO_PRISMA[v];
}

export function fromPrismaPriceModel(v?: PrismaPriceModel | null): ClientPriceModel | null {
  if (v == null) return null;
  return FROM_PRISMA[v as Exclude<PrismaPriceModel, null>];
}
