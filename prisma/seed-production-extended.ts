// prisma/seed-production-extended.ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function upsertSupplier(key: string, data: any) {
  return prisma.supplier.upsert({
    where: { id: key },
    update: data,
    create: { id: key, ...data },
  });
}

async function upsertRoom(key: string, supplierId: string, data: any) {
  return prisma.room.upsert({
    where: { id: key },
    update: { ...data, supplierId },
    create: { id: key, supplierId, ...data },
  });
}

async function upsertBooking(key: string, data: any) {
  return prisma.booking.upsert({
    where: { id: key },
    update: data,
    create: { id: key, ...data },
  });
}

async function upsertPickup(bookingId: string, data: any) {
  // If Pickup model supports scalar bookingId, Prisma will accept bookingId.
  // Using upsert with scalar bookingId in update/create fields is fine.
  return prisma.pickup.upsert({
    where: { bookingId },
    update: data,
    create: { bookingId, ...data },
  });
}

/**
 * Properly upserts a SupplierVoucher by 'publicId', and when creating,
 * ensures the booking and supplier relations are connected.
 *
 * NOTE: pass supplierId (existing supplier) and bookingId (existing booking).
 */
// replace only the upsertSupplierVoucher function with this
async function upsertSupplierVoucher(publicId: string, bookingId: string, supplierId: string, data: any) {
  // ensure booking and supplier exist (fail fast with helpful message)
  const [bk, sup] = await Promise.all([
    prisma.booking.findUnique({ where: { id: bookingId } }),
    prisma.supplier.findUnique({ where: { id: supplierId } }),
  ]);

  if (!bk) throw new Error(`Booking not found for id=${bookingId}. Run booking seeder first.`);
  if (!sup) throw new Error(`Supplier not found for id=${supplierId}. Run supplier seeder first.`);

  const existing = await prisma.supplierVoucher.findUnique({ where: { publicId } });

  const payloadForCreate: any = {
    publicId,
    filename: data.filename ?? null,
    uploadedAt: data.uploadedAt ?? new Date(),
    emailedAt: data.emailedAt ?? null,
    supplierName: data.supplierName ?? null,
    supplierType: data.supplierType ?? null,
    supplierRef: data.supplierRef ?? null,
    contactJson: data.contactJson ?? null,
    // connect relations by id (nested writes)
    booking: { connect: { id: bookingId } },
    supplier: { connect: { id: supplierId } },
  };

  if (existing) {
    // update — use nested connects (will be a no-op if already connected)
    return prisma.supplierVoucher.update({
      where: { publicId },
      data: {
        filename: payloadForCreate.filename,
        uploadedAt: payloadForCreate.uploadedAt,
        emailedAt: payloadForCreate.emailedAt,
        supplierName: payloadForCreate.supplierName,
        supplierType: payloadForCreate.supplierType,
        supplierRef: payloadForCreate.supplierRef,
        contactJson: payloadForCreate.contactJson,
        booking: { connect: { id: bookingId } },
        supplier: { connect: { id: supplierId } },
      },
    });
  } else {
    // create
    return prisma.supplierVoucher.create({
      data: payloadForCreate,
    });
  }
}


async function upsertTravelPack(bookingId: string, data: any) {
  return prisma.travelPack.upsert({
    where: { bookingId },
    update: data,
    create: { bookingId, ...data },
  });
}

async function main() {
  console.log('🌱 Starting production-ready seeding...');

  // ensure supplier (hotel)
  const hotel = await upsertSupplier('sup-hotel-lamu-001', {
    name: 'Lamu Beach Cottages',
    type: 'HOTEL',
    phone: '+254700000111',
    email: 'reservations@lamubeach.example.com',
    website: 'https://lamubeach.example.com',
    address: 'Shella Beach, Lamu',
    lat: -2.2705,
    lng: 40.9050,
  });

  // rooms
  const room1 = await upsertRoom('room-lamu-01', hotel.id, {
    code: 'LBC-TWIN-01',
    title: 'Sea-facing Twin Room',
    roomType: 'Twin',
    capacity: 2,
    inventory: 3,
    priceFrom: 7500,
    currency: 'KES',
    amenities: ['ensuite', 'breakfast'],
  });

  const room2 = await upsertRoom('room-lamu-02', hotel.id, {
    code: 'LBC-DOUBLE-01',
    title: 'Deluxe Double',
    roomType: 'Double',
    capacity: 2,
    inventory: 2,
    priceFrom: 9500,
    currency: 'KES',
    amenities: ['ensuite', 'sea view', 'breakfast'],
  });

  // find destination (your destination seeder must have created this)
  const dest = await prisma.destination.findUnique({ where: { slug: 'lamu-old-town' } });
  if (!dest) {
    console.warn('⚠️ Destination "lamu-old-town" not found — run destination seeder first.');
    return;
  }

  // booking id constant so upsert is idempotent
  const bookingId = `bk-${dest.id}-demo-01`;
  const booking = await upsertBooking(bookingId, {
    reference: 'LAMU-PROD-001',
    destinationId: dest.id,
    durationOptionId: null,
    fromDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    toDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    nights: 3,
    adults: 2,
    children: 0,
    infants: 0,
    rooms: 1,
    unitsBooked: 1,
    totalPrice: 28500,
    currency: 'KES',
    status: 'CONFIRMED',
    accommodationSupplierId: hotel.id,
    roomId: room2.id,
    checkInAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    checkOutAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    flightNumber: 'KQ123',
    specialRequests: 'Vegetarian meals; late check-in',
    pickupRequested: true,
  });

  // pickup (simple)
  await upsertPickup(booking.id, {
    type: 'AIRPORT',
    provider: 'COMPANY',
    vehicleType: 'VAN',
    providerName: 'Lamu Transfers Ltd',
    contactPhone: '+254733444555',
    pickupAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000),
    flightNumber: 'KQ123',
    airline: 'Kenya Airways',
    terminal: 'T1',
    pickupAddress: 'Moi International Airport',
    pickupLat: -1.3192,
    pickupLng: 36.9278,
    notes: 'Driver will hold a sign with guest name',
  });

  // supplier voucher — IMPORTANT: pass hotel.id so relation can be connected
  await upsertSupplierVoucher('sup-voucher-lamu-001', booking.id, hotel.id, {
    supplierName: hotel.name,
    supplierType: 'HOTEL',
    supplierRef: 'LBC-BK-001',
    filename: 'SupplierVoucher-LAMU-PROD-001.pdf',
    contactJson: { phone: hotel.phone, email: hotel.email, address: hotel.address },
    emailedAt: new Date(),
    uploadedAt: new Date(),
  });

  // travel pack
  await upsertTravelPack(booking.id, {
    publicId: `travelpacks/${booking.id}/TravelPack-${booking.reference}.pdf`,
    filename: `TravelPack-${booking.reference}.pdf`,
    uploadedAt: new Date(),
    emailedAt: new Date(),
  });

  console.log('✅ Seeded supplier, rooms, booking, pickup, supplier voucher, travel pack.');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
