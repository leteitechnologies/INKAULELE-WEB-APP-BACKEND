// src/modules/experiences/mappers.ts
import { fromPrismaPriceModel } from '@app/utils/price-model';

export function mapDurationForClient(d: any) {
  return {
    id: d.id,
    title: d.title,
    days: d.days,
    durationLabel: d.durationLabel,
    maxNights: d.maxNights,
    minGuests: d.minGuests,
    maxGuests: d.maxGuests,
    priceFrom: d.priceFrom,
    priceModel: fromPrismaPriceModel(d.priceModel as any),
    inventory: d.inventory,
    maxRooms: d.maxRooms,
    maxInfants: d.maxInfants,
    currency: d.currency,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

export function mapExperienceForClient(exp: any) {
  return {
    ...exp,
    durations: Array.isArray(exp.durations) ? exp.durations.map(mapDurationForClient) : [],
    gallery: Array.isArray(exp.gallery) ? exp.gallery.map((g:any) => g.imageUrl ?? g.url ?? g.src).filter(Boolean) : [],
  };
}
