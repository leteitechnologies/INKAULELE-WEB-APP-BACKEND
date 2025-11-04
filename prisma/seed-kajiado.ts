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
  console.log("Seeding Kajiado destinations (idempotent, upsert by slug) ...");

  // ===== KAJIADO DESTINATIONS =====

  // 1) Amboseli National Park
  const amboseli = await upsertDestination("amboseli-national-park", {
    title: "Amboseli National Park",
    subtitle: "Famous for its elephants and sweeping views of Mount Kilimanjaro",
    excerpt: "One of Kajiado’s crown attractions. Famous for its elephants, views of Mt. Kilimanjaro, and diverse wildlife.",
    country: "Kenya",
    region: "Kajiado County",
    lat: -2.637,
    lng: 37.255,
    coverImage: "https://res.cloudinary.com/demo/image/upload/amboseli.jpg",
    tags: ["wildlife", "safari", "photography"],
    inclusions: ["Park entry (where applicable)", "Game drives"],
    exclusions: ["Flights", "Personal expenses"],
    practicalInfo: {
      bestTimeToVisit: "June - October (dry season)",
      notes: "Great early morning and late afternoon game viewing; Mt. Kilimanjaro views when clear.",
    },
    rating: 0.0,
    reviewCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await ensureGallery(amboseli.id, [
    "https://res.cloudinary.com/demo/image/upload/amboseli-1.jpg",
    "https://res.cloudinary.com/demo/image/upload/amboseli-2.jpg",
  ]);

  await ensureDurations(amboseli.id, [
    { title: "Day trip / Game drives", priceFrom: 8000, currency: "KES", minGuests: 1, maxGuests: 8 },
    { title: "2-day safari", priceFrom: 25000, currency: "KES", days: 2, minGuests: 2, maxGuests: 6 },
  ]);

  await ensureItineraries(amboseli.id, [
    { day: 1, time: "06:00", title: "Morning game drive", description: "Early morning game drive to see elephants and other wildlife." },
    { day: 1, time: "15:30", title: "Afternoon game drive", description: "Late afternoon drive with mountain views when weather permits." },
  ]);

  await ensureReviews(amboseli.id, [
    { author: "Visitor", rating: 5, text: "Amazing elephant encounters and Kilimanjaro backdrop.", createdAt: new Date(), status: "APPROVED" },
  ]);

  // 2) Ngong Hills
  const ngong = await upsertDestination("ngong-hills", {
    title: "Ngong Hills",
    subtitle: "Hiking ridge with panoramic views and windmills",
    excerpt: "Great for hiking, panoramic views and walking trails.",
    country: "Kenya",
    region: "Kajiado County",
    lat: -1.366,
    lng: 36.665,
    coverImage: "https://res.cloudinary.com/demo/image/upload/ngong-hills.jpg",
    tags: ["hiking", "day-trip", "views"],
    inclusions: ["Guided hikes (optional)"],
    exclusions: ["Transport to trailhead"],
    practicalInfo: {
      bestTimeToVisit: "Year-round (early morning recommended)",
      trailDifficulty: "Moderate — allow 3–5 hours for the full ridge",
    },
    rating: 0.0,
    reviewCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await ensureGallery(ngong.id, [
    "https://res.cloudinary.com/demo/image/upload/ngong-1.jpg",
  ]);

  await ensureDurations(ngong.id, [
    { title: "Half-day hike", priceFrom: 1800, currency: "KES", minGuests: 1, maxGuests: 12 },
  ]);

  await ensureItineraries(ngong.id, [
    { day: 1, time: "07:00", title: "Ngong ridge hike", description: "Summit sections with views over Nairobi and the Rift Valley." },
  ]);

  // 3) Lake Magadi
  const magadi = await upsertDestination("lake-magadi", {
    title: "Lake Magadi",
    subtitle: "Soda lake with flamingos and mineral flats",
    excerpt: "A scenic soda lake in the southern part of the county.",
    country: "Kenya",
    region: "Kajiado County",
    lat: -1.930,
    lng: 36.283,
    coverImage: "https://res.cloudinary.com/demo/image/upload/lake-magadi.jpg",
    tags: ["birdwatching", "day-trip", "scenery"],
    inclusions: ["Park access where required"],
    exclusions: ["Meals unless stated"],
    practicalInfo: {
      bestTimeToVisit: "Dry season for easy access; flamingos when water levels allow",
    },
    rating: 0.0,
    reviewCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await ensureGallery(magadi.id, [
    "https://res.cloudinary.com/demo/image/upload/lake-magadi-1.jpg",
  ]);

  await ensureDurations(magadi.id, [
    { title: "Day trip", priceFrom: 6000, currency: "KES", minGuests: 1, maxGuests: 8 },
  ]);

  // 4) Olorgesailie Prehistoric Site
  const olorgesailie = await upsertDestination("olorgesailie-prehistoric-site", {
    title: "Olorgesailie Prehistoric Site",
    subtitle: "Important Acheulian archaeological site with fossils and handaxes",
    excerpt: "Archaeological site of ancient human history and fossils.",
    country: "Kenya",
    region: "Kajiado County",
    lat: -1.915,
    lng: 36.329,
    coverImage: "https://res.cloudinary.com/demo/image/upload/olorgesailie.jpg",
    tags: ["history", "archaeology", "culture"],
    inclusions: ["Guided site visit"],
    exclusions: ["Transport"],
    practicalInfo: {
      bestTimeToVisit: "Dry season preferred; bring sun protection",
    },
    rating: 0.0,
    reviewCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await ensureGallery(olorgesailie.id, [
    "https://res.cloudinary.com/demo/image/upload/olorgesailie-1.jpg",
  ]);

  await ensureDurations(olorgesailie.id, [
    { title: "Half-day visit", priceFrom: 4500, currency: "KES", minGuests: 1, maxGuests: 12 },
  ]);

  // 5) Shompole Conservancy
  const shompole = await upsertDestination("shompole-conservancy", {
    title: "Shompole Conservancy",
    subtitle: "Private wildlife conservancy and community project",
    excerpt: "Wildlife, nature, and a quieter alternative to big parks.",
    country: "Kenya",
    region: "Kajiado County",
    lat: -1.705,
    lng: 36.928,
    coverImage: "https://res.cloudinary.com/demo/image/upload/shompole.jpg",
    tags: ["conservancy", "wildlife", "community"],
    rating: 0.0,
    reviewCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // 6) Selenkay Conservancy
  const selenkay = await upsertDestination("selenkay-conservancy", {
    title: "Selenkay Conservancy",
    subtitle: "Scenic conservancy with wildlife and open landscapes",
    excerpt: "Wild landscapes and wildlife experiences.",
    country: "Kenya",
    region: "Kajiado County",
    lat: -1.934,
    lng: 36.975,
    coverImage: "https://res.cloudinary.com/demo/image/upload/selenkay.jpg",
    tags: ["conservancy", "wildlife"],
    rating: 0.0,
    reviewCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // 7) Nyiri Desert
  const nyiri = await upsertDestination("nyiri-desert", {
    title: "Nyiri (Tarangire/Nyiri) Desert Landscape",
    subtitle: "Drylands, sand and wide open vistas",
    excerpt: "The dry landscapes, sand, open vistas.",
    country: "Kenya",
    region: "Kajiado County",
    lat: -1.900,
    lng: 36.700,
    coverImage: "https://res.cloudinary.com/demo/image/upload/nyiri.jpg",
    tags: ["landscape", "adventure"],
    rating: 0.0,
    reviewCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // 8) Kitengela Glass Studio / Art & Glass Crafts
  const kitengela = await upsertDestination("kitengela-glass-studio", {
    title: "Kitengela Glass Studio",
    subtitle: "Contemporary glass art studio and workshops",
    excerpt: "Artistic glasswork and creativity.",
    country: "Kenya",
    region: "Kajiado County",
    lat: -1.410,
    lng: 36.942,
    coverImage: "https://res.cloudinary.com/demo/image/upload/kitengela-glass.jpg",
    tags: ["art", "workshops", "culture"],
    inclusions: ["Studio visit", "Optional workshop"],
    rating: 0.0,
    reviewCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // 9) Maasai Ostrich Farm
  const ostrich = await upsertDestination("maasai-ostrich-farm", {
    title: "Maasai Ostrich Farm & Resort",
    subtitle: "Ostrich farm tours and family-friendly activities",
    excerpt: "Ostrich interactions, farm tours, and family‑friendly attraction.",
    country: "Kenya",
    region: "Kajiado County",
    lat: -1.850,
    lng: 36.750,
    coverImage: "https://res.cloudinary.com/demo/image/upload/ostrich-farm.jpg",
    tags: ["farm", "family", "animals"],
    rating: 0.0,
    reviewCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // 10) Mount Suswa (volcanic features / caves)
  const suswa = await upsertDestination("mount-suswa", {
    title: "Mount Suswa",
    subtitle: "Volcanic mountain with caves and scenic terrain",
    excerpt: "Volcanic features, caves, scenic terrain (though partly in neighboring counties).",
    country: "Kenya",
    region: "Kajiado County",
    lat: -1.781,
    lng: 36.187,
    coverImage: "https://res.cloudinary.com/demo/image/upload/mount-suswa.jpg",
    tags: ["hiking", "caves", "volcano"],
    rating: 0.0,
    reviewCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // 11) Resorts, Lodges & Scenic Retreats (generic entry)
  const resorts = await upsertDestination("kajiado-resorts-lodges", {
    title: "Resorts & Lodges in Kajiado",
    subtitle: "Lodges, camps and scenic retreats across Kajiado",
    excerpt: "e.g. Lerruat Log Resort, Oldonyo Orok Lodge, Saab Royale, Tumaini Gardens. Great for relaxation and enjoying nature.",
    country: "Kenya",
    region: "Kajiado County",
    lat: -1.600,
    lng: 36.800,
    coverImage: "https://res.cloudinary.com/demo/image/upload/kajiado-resorts.jpg",
    tags: ["lodges", "relax", "retreat"],
    rating: 0.0,
    reviewCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });



  console.log("Finished seeding Kajiado destinations.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
