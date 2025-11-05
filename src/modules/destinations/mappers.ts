// src/modules/destinations/mappers.ts

import { fromPrismaPriceModel } from "../../utils/price-model";



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

export function mapDestinationForClient(dest: any) {
  return {
    ...dest,
    durations: Array.isArray(dest.durations) ? dest.durations.map(mapDurationForClient) : [],
    gallery: Array.isArray(dest.gallery) ? dest.gallery.map((g:any) => g.imageUrl ?? g.url ?? g.src).filter(Boolean) : [],
  };
}
