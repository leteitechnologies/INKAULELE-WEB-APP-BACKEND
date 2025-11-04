// prisma/seed-experiences.ts
import { PrismaClient, PackageType } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Lightweight experience seed for local/dev DB.
 * - Idempotent where possible (upsert for slug-based unique key)
 * - Adds: experience rows, galleries, itinerary items, inventory and blocked dates, and reviews
 * - Reviews will be attached to a placeholder Destination when no destinationId is available
 */

const experiences = [
  {
    slug: "maasai-cultural-village",
    title: "Maasai Cultural Village",
    excerpt:
      "A hands-on half-day visit to a Maasai village — music, beadwork, food and stories.",
    overview:
      "Step into the heart of Maasai life. This immersive experience introduces guests to homestead life, beadwork and ceremonial activities.",
    country: "Kenya",
    region: "Amboseli",
    lat: -2.648,
    lng: 37.255,
    coverImage:
      "https://res.cloudinary.com/dahrcnjfh/image/upload/v1759388752/maasai-cultural-village.jpg",
    tags: ["culture", "maasai", "community"],
    inclusions: ["Local host/guide", "Meals as described", "Bottled water"],
    exclusions: ["Transport to meeting point", "Souvenirs"],
    practicalInfo: {
      groupSize: "Max 12",
      languages: ["English", "Maa", "Swahili"],
      accessibility: "Rustic terrain — limited wheelchair access",
      recommendedClothing: "Comfortable, modest clothing",
    },
    host: {
      name: "Johnson Kantai",
      email: "johnson.kantai@example.com",
      phone: "+254712345678",
      about: "Local Maasai community host and cultural guide",
    },
    priceFrom: 45.0,
    duration: "4 hours",
    packageType: PackageType.DAY,
    maxPackageDays: 1,
    maxGuests: 12,
    maxRooms: 0,
    maxInfants: 2,
    gallery: [
      "https://res.cloudinary.com/dahrcnjfh/image/upload/v1759388752/maasai-cultural-village.jpg",
      "https://res.cloudinary.com/dahrcnjfh/image/upload/v1759733142/lamu-old-town-1.jpg",
    ],
    itinerary: [
      { time: "08:00", title: "Welcome & orientation", description: "Greeting and welcome song" },
      { time: "08:20", title: "Village walk", description: "Visit homesteads, beadwork demo" },
      { time: "09:30", title: "Communal meal", description: "Tasting traditional roast goat" },
      { time: "10:30", title: "Elder storytelling", description: "Stories and Q&A" },
    ],
    inventory: {
      "2025-11-20": { capacity: 12, booked: 0 },
      "2025-11-21": { capacity: 12, booked: 3 },
    },
    blockedDates: ["2025-12-25"],
    reviews: [
      { id: "mto-001-r1", author: "Moses", rating: 4, text: "Wonderful cultural insight." },
      { id: "mto-001-r2", author: "Sally", rating: 5, text: "Amazing hosts and food." },
    ],
  },

  {
    slug: "nairobi-street-food-walk",
    title: "Nairobi Street Food Walk",
    excerpt: "Taste the best street food and meet vendor partners in Nairobi.",
    overview:
      "A guided walking tour sampling Nairobi's iconic street food — from mandazis to nyama choma bites.",
    country: "Kenya",
    region: "Nairobi",
    lat: -1.286389,
    lng: 36.817223,
    coverImage: "https://images.unsplash.com/photo-1533777324565-a040eb52fac2?w=1200&q=60",
    tags: ["food", "city", "walk"],
    inclusions: ["Local food guide", "Snacks as listed"],
    exclusions: ["Transport", "Full meals not listed"],
    practicalInfo: { languages: ["English", "Swahili"], groupSize: "Max 8" },
    host: { name: "Chef Ken", phone: "+254712345678", about: "Local chef & foodie guide" },
    priceFrom: 30.0,
    duration: "3 hours",
    packageType: PackageType.MULTI_DAY,
    maxPackageDays: 1,
    maxGuests: 8,
    gallery: ["https://images.unsplash.com/photo-1533777324565-a040eb52fac2?w=800&q=60"],
    inventory: { "2025-11-21": { capacity: 8, booked: 2 } },
    itinerary: [
      { time: "17:00", title: "Meet & Intro", description: "Meet at the chosen market" },
      { time: "17:30", title: "Food sampling", description: "Visit 6 curated stalls" },
    ],
    reviews: [{ id: "nrb-001-r1", author: "Amina", rating: 5, text: "Fantastic food tour!" }],
  },
];

/**
 * Upsert a destination (we use this to create a small placeholder
 * destination so reviews that require destinationId can be created).
 */
async function upsertDestination(slug: string, data: any) {
  return prisma.destination.upsert({
    where: { slug },
    update: { ...data, updatedAt: new Date() },
    create: { ...data, slug, createdAt: new Date(), updatedAt: new Date() },
  });
}

/**
 * Upsert one experience entry (galleries, itinerary, inventory, blocked dates, reviews).
 * Any review without an explicit destinationId will be attached to `placeholderDest.id`.
 */
async function upsertExperienceBySlug(exp: typeof experiences[0], placeholderDestId: string) {
  const { slug, gallery, itinerary, inventory, blockedDates, reviews, ...rest } = exp as any;

  // ensure tags array exists to avoid missing required fields in some schemas
  if (!rest.tags) rest.tags = [];

  // Upsert experience (idempotent by slug)
  const experience = await prisma.experience.upsert({
    where: { slug },
    update: { ...rest, updatedAt: new Date() },
    create: { ...rest, slug, createdAt: new Date(), updatedAt: new Date() },
  });

  // Galleries: upsert per deterministic id
  if (Array.isArray(gallery)) {
    for (const [i, url] of gallery.entries()) {
      const gid = `${slug}-g-${i + 1}`;
      await prisma.gallery.upsert({
        where: { id: gid },
        update: { imageUrl: url, experienceId: experience.id, order: i + 1 },
        create: { id: gid, experienceId: experience.id, imageUrl: url, order: i + 1 },
      });
    }
  }

  // Itinerary items
  if (Array.isArray(itinerary)) {
    for (const [i, it] of itinerary.entries()) {
      const iid = `${slug}-it-${i + 1}`;
      await prisma.itineraryItem.upsert({
        where: { id: iid },
        update: {
          experienceId: experience.id,
          time: it.time ?? null,
          title: it.title,
          description: it.description ?? null,
        },
        create: {
          id: iid,
          experienceId: experience.id,
          time: it.time ?? null,
          title: it.title,
          description: it.description ?? null,
        },
      });
    }
  }

  // Experience inventory (createMany skipDuplicates)
  // Experience inventory (createMany skipDuplicates) — replaced to use durationInventory
  if (inventory && typeof inventory === "object") {
    // Ensure there is at least one DurationOption for this experience (reuse if exists, else create a default).
    let durationOpt = await prisma.durationOption.findFirst({ where: { experienceId: experience.id }, select: { id: true } });

    if (!durationOpt) {
      // create a simple default duration option — adjust fields as you like
      durationOpt = await prisma.durationOption.create({
        data: {
          id: `${experience.id}-default-duration`, // deterministic id
          experienceId: experience.id,
          title: "Default",
          days: 0,
          priceFrom: rest.priceFrom ?? 0,
          priceModel: "PER_BOOKING", // or PER_PERSON / PER_ROOM — choose what makes sense
          currency: (rest.currency as string) ?? "USD",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        select: { id: true },
      });
    }

    const invData = Object.entries(inventory).map(([dateStr, v]) => ({
      durationOptionId: durationOpt!.id,
      // normalize date -> midnight UTC (Date constructor is fine for ISO date strings)
      date: new Date(dateStr + "T00:00:00Z"),
      capacity: (v as any).capacity ?? 0,
      booked: (v as any).booked ?? 0,
      createdAt: new Date(),
    }));

    if (invData.length) {
      // createMany on durationInventory; skipDuplicates uses the unique composite (durationOptionId + date)
      await prisma.durationInventory.createMany({ data: invData, skipDuplicates: true });
    }
  }


  // Blocked dates
  if (Array.isArray(blockedDates) && blockedDates.length) {
    const blocked = blockedDates.map((d) => ({
      experienceId: experience.id,
      date: new Date(d),
      reason: "blocked by seed",
      createdAt: new Date(),
    }));
    await prisma.experienceBlockedDate.createMany({ data: blocked, skipDuplicates: true });
  }

  // Reviews: attach to placeholder destination when destinationId is not present
  if (Array.isArray(reviews) && reviews.length) {
    for (const r of reviews) {
      const id = r.id ?? `${slug}-r-${Math.random().toString(36).slice(2, 8)}`;

      // Use provided destinationId if present, else fallback to placeholder
      const destinationIdForReview = r.destinationId ?? placeholderDestId;

      await prisma.review.upsert({
        where: { id },
        update: {
          experienceId: experience.id,
          destinationId: destinationIdForReview,
          author: r.author,
          avatar: r.avatar ?? null,
          email: r.email ?? null,
          rating: r.rating,
          text: r.text,
          status: r.status ?? "APPROVED",
          updatedAt: new Date(),
        },
        create: {
          id,
          experienceId: experience.id,
          destinationId: destinationIdForReview,
          author: r.author,
          avatar: r.avatar ?? null,
          email: r.email ?? null,
          rating: r.rating,
          text: r.text,
          status: r.status ?? "APPROVED",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    }

    // Recompute aggregates for this experience (approved reviews only)
    const agg = await prisma.review.aggregate({
      where: { experienceId: experience.id, status: "APPROVED" },
      _avg: { rating: true },
      _count: { id: true },
    });

    await prisma.experience.update({
      where: { id: experience.id },
      data: {
        rating: Number(agg._avg.rating ?? 0),
        reviewCount: Number(agg._count.id ?? 0),
      },
    });
  }

  return experience;
}

async function main() {
  console.log("Seeding experiences...");

  // Create a small placeholder destination so reviews (which require destinationId) can be created.
  const placeholder = await upsertDestination("experience-reviews-placeholder", {
    title: "Placeholder for experience reviews",
    subtitle: "Auto-generated placeholder used by experience seed reviews",
    excerpt:
      "This destination record exists only so seeded experience reviews can meet the DB's required destination relationship.",
    country: "N/A",
    region: "N/A",
    lat: 0,
    lng: 0,
    coverImage: "",
    tags: [],
    inclusions: [],
    exclusions: [],
    practicalInfo: {},
    rating: 0.0,
    reviewCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  for (const e of experiences) {
    const res = await upsertExperienceBySlug(e as any, placeholder.id);
    console.log("Upserted", res.slug, res.id);
  }

  console.log("Done.");
}

main()
  .catch((err) => {
    console.error("Seeding error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
