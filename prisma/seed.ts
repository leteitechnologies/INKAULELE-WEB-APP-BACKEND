import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function upsertDestination(slug: string, data: any) {
  return prisma.destination.upsert({
    where: { slug },
    update: data,
    create: { slug, ...data },
  });
}

async function ensureGallery(destId: string, images: string[]) {
  for (const [i, url] of images.entries()) {
    await prisma.gallery.upsert({
      where: { id: `${destId}-gallery-${i + 1}` },
      update: { imageUrl: url, order: i + 1, destinationId: destId },
      create: { id: `${destId}-gallery-${i + 1}`, destinationId: destId, imageUrl: url, order: i + 1 },
    });
  }
}

async function ensureDurations(destId: string, durations: any[]) {
  for (const d of durations) {
    const id = d.id ?? `${destId}-duration-${d.title.replace(/\s+/g, "-").toLowerCase()}`;
    await prisma.durationOption.upsert({
      where: { id },
      update: {
        destinationId: destId,
        title: d.title,
        days: d.days ?? null,
        maxNights: d.maxNights ?? null,
        minGuests: d.minGuests ?? null,
        maxGuests: d.maxGuests ?? null,
        priceFrom: d.priceFrom ?? null,
        maxRooms: d.maxRooms ?? null,
        currency: d.currency ?? null,
      },
      create: {
        id,
        destinationId: destId,
        title: d.title,
        days: d.days ?? null,
        maxNights: d.maxNights ?? null,
        minGuests: d.minGuests ?? null,
        maxGuests: d.maxGuests ?? null,
        priceFrom: d.priceFrom ?? null,
        maxRooms: d.maxRooms ?? null,
        currency: d.currency ?? null,
      },
    });
  }
}

async function ensureItineraries(destId: string, itineraries: any[]) {
  for (const [i, it] of itineraries.entries()) {
    const id = `${destId}-it-${i + 1}`;
    await prisma.itineraryItem.upsert({
      where: { id },
      update: {
        destinationId: destId,
        day: it.day ?? null,
        time: it.time ?? null,
        title: it.title,
        description: it.description ?? null,
        applicableDurations: it.applicableDurations ?? [],
      },
      create: {
        id,
        destinationId: destId,
        day: it.day ?? null,
        time: it.time ?? null,
        title: it.title,
        description: it.description ?? null,
        applicableDurations: it.applicableDurations ?? [],
      },
    });
  }
}

async function ensureReviews(destId: string, reviews: any[]) {
  for (const [i, r] of reviews.entries()) {
    const id = r.id ?? `${destId}-r-${i + 1}`;
    await prisma.review.upsert({
      where: { id },
      update: {
        destinationId: destId,
        author: r.author,
        avatar: r.avatar ?? null,
        email: r.email ?? null,
        rating: r.rating,
        text: r.text,
        status: r.status ?? "APPROVED",
        createdAt: r.createdAt ?? new Date(),
      },
      create: {
        id,
        destinationId: destId,
        author: r.author,
        avatar: r.avatar ?? null,
        email: r.email ?? null,
        rating: r.rating,
        text: r.text,
        status: r.status ?? "APPROVED",
        createdAt: r.createdAt ?? new Date(),
      },
    });
  }

  // Recompute aggregates (only count APPROVED reviews)
  const agg = await prisma.review.aggregate({
    where: { destinationId: destId, status: "APPROVED" },
    _avg: { rating: true },
    _count: { id: true },
  });

  const avgRating = Number(agg._avg.rating ?? 0);
  const total = Number(agg._count.id ?? 0);

  await prisma.destination.update({ where: { id: destId }, data: { rating: avgRating, reviewCount: total } });
}

async function main() {
  console.log("Seeding destinations (idempotent, upsert by slug) ...");

  // Primary: Lamu Old Town
  const lamuData = {
    title: "Lamu Old Town & Archipelago Exploration",
       subtitle: "A place where the pace of life slows to the rhythm of the tides",
    excerpt:
      "Sail, stroll and savor Lamu: Swahili architecture, sandy lanes, dhow sails and timeless hospitality.",
   
    country: "Kenya",
    region: "Lamu Archipelago",
    lat: -2.271,
    lng: 40.902,
    coverImage:
      "https://res.cloudinary.com/dahrcnjfh/image/upload/v1759744994/boat-shore-near-sea-sunny-day-with-cloudy-sky-background-min_zmrhzt.jpg",
    tags: ["culture", "islands", "heritage", "relax"],
    inclusions: ["Local guide", "Light lunch"],
    exclusions: ["Flights", "Accommodation (unless stated)"],
    practicalInfo: {
      bestTimeToVisit: "June - October (dry season)",
      avgTemperature: "24°C - 32°C",
      groupSize: "Small groups (1-8)",
      languages: ["English", "Swahili"],
      accessibility: "Partial — cobbled streets and sandy paths",
      transportOptions: ["Fly to Lamu (daily flights)", "Boat transfers available"],
    },
    rating: 0.0,
    reviewCount: 0,
  };

  const lamu = await upsertDestination("lamu-old-town", { ...lamuData, createdAt: new Date(), updatedAt: new Date() });

  await ensureGallery(lamu.id, [
    "https://res.cloudinary.com/dahrcnjfh/image/upload/v1759733142/lamu-old-town-1.jpg",
    "https://res.cloudinary.com/dahrcnjfh/image/upload/v1759744892/colorful-abandoned-market-stalls-somewhere-along-highway-utah-min_pbcd01.jpg",
    "https://res.cloudinary.com/dahrcnjfh/image/upload/v1759733773/dea554dd0ed953de3f1df12270a48eac_hk8of1.jpg",
  ]);

  await ensureDurations(lamu.id, [
    { id: `${lamu.id}-d1`, title: "Half day walking tour", priceFrom: 3500, currency: "KES", minGuests: 1, maxGuests: 8, maxNights: 1 },
    { id: `${lamu.id}-d2`, title: "2-day cultural package", priceFrom: 12000, currency: "KES", minGuests: 2, maxGuests: 4, maxNights: 2, maxRooms: 2, days: 2 },
  ]);

  await ensureItineraries(lamu.id, [
    { day: 1, time: "09:00", title: "Welcome & Old Town Walk", description: "Meet at the harbour for an orientation walk through the maze-like alleys of Lamu Old Town.", applicableDurations: [] },
    { day: 1, time: "12:30", title: "Swahili Lunch", description: "Enjoy a home-cooked Swahili meal on the water's edge.", applicableDurations: [] },
    { day: 2, time: "07:00", title: "Dhow Sailing & Snorkel", description: "Sail between islands, snorkel and explore remote sandbanks.", applicableDurations: [] },
  ]);

  await ensureReviews(lamu.id, [
    { id: `${lamu.id}-r1`, author: "Moses", rating: 4, text: "A wonderful insight into island life — highly recommended.", createdAt: new Date("2024-11-03"), status: "APPROVED" },
    { id: `${lamu.id}-r2`, author: "Sally", rating: 5, text: "The dhow trip was the highlight. Great food and patient guide.", createdAt: new Date("2024-09-19"), status: "APPROVED" },
  ]);

  // ===== Add nearby destinations (these are separate Destination rows with nearby lat/lng) =====
  // Manda Island (very close to Lamu)
  const manda = await upsertDestination("manda-island", {
    title: "Manda Island Dhow & Beach Stay",
    subtitle: "in the heart of the lamu lives the soul of swahili culture and heritage",
    excerpt: "Short dhow trips, quiet beaches and local seafood in Manda Island.",
    country: "Kenya",
    region: "Lamu Archipelago",
    lat: -2.277,
    lng: 40.915,
    coverImage: "https://res.cloudinary.com/dahrcnjfh/image/upload/v1759733316/ccbd95e6f2d4af21f87f4886a81c1067_xpvkd1.jpg",
    tags: ["beach", "islands", "relax"],
    rating: 0.0,
    reviewCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await ensureGallery(manda.id, [
    "https://res.cloudinary.com/dahrcnjfh/image/upload/v1759733390/0afaac37c92ad2b31cac3068930191ec_fb4qrw.jpg",
  ]);

  // Pate Island (nearby culturally-rich island)
  const pate = await upsertDestination("pate-island", {
    title: "Pate Island Cultural Walks",
    subtitle: "Explore ancient ruins and traditional villages on Pate Island",
    excerpt: "Historic Pate with its ruins, dhow makers and sleepy villages.",
    country: "Kenya",
    region: "Lamu Archipelago",
    lat: -2.150,
    lng: 40.900,
    coverImage: "https://res.cloudinary.com/dahrcnjfh/image/upload/v1759734037/cd8ccbc29b82e03975e3e1aa973b7458_effpza.jpg",
    tags: ["culture", "history"],
    rating: 0.0,
    reviewCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Small reviews for nearby
  await ensureReviews(manda.id, [
    { id: `${manda.id}-r1`, author: "Amina", rating: 5, text: "Beautiful quiet beaches.", createdAt: new Date("2024-10-10"), status: "APPROVED" },
  ]);
  await ensureReviews(pate.id, [
    { id: `${pate.id}-r1`, author: "John", rating: 4, text: "Lovely ruins and friendly people.", createdAt: new Date("2024-08-22"), status: "APPROVED" },
  ]);

  console.log("Seeding finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
