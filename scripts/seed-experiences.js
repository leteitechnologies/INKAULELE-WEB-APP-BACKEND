// scripts/seed-experiences.js
// Usage: node scripts/seed-experiences.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Experiences sample
 */
const EXPERIENCES_SAMPLE = [
  {
    id: "mto-001",
    title: "Maasai Cultural Village",
    slug: "maasai-cultural-village",
    location: "Amboseli, Kenya",
    duration: "4 hours",
    price: "$45",
    packageType: "DAY",
    maxPackageDays: 1,
    maxGuests: 12,
    maxRooms: 5,
    maxInfants: 3,
    image: "https://res.cloudinary.com/dahrcnjfh/image/upload/v1759388752/maasai-cultural-village.jpg",
    excerpt:
      "Experience a guided tour of a Maasai cultural village with traditional dance, goat slaughtering and storytelling.",
    overview:
      "Step into the heart of Maasai life. This immersive half-day experience takes you inside a real village where families welcome you with warmth, openness, and tradition.",
    inclusions: [
      "Guided cultural host",
      "All activities listed",
      "Shared roasted goat feast",
      "Bottled water",
    ],
    exclusions: [
      "Transport to village (can be arranged at extra cost)",
      "Personal purchases (beadwork, crafts)",
    ],
    practicalInfo: {
      groupSize: "Max 12 people",
      language: "English, Swahili, Maa",
      dressCode: "Comfortable clothes, respectful modest wear",
      accessibility: "Rustic environment; limited wheelchair access",
    },
    host: {
      name: "Johnson Kantai",
      avatar: "",
      email: "chef.ken@example.com",
    },
    inventory: {
      "2025-10-09": { capacity: 12, booked: 0 },
      "2025-10-10": { capacity: 12, booked: 8 },
      "2025-10-11": { capacity: 12, booked: 2 },
    },
    blockedDates: ["2025-12-25"],

    itinerary: [
      {
        order: 1,
        time: "08:00 – 08:30",
        activity: "Arrival, greetings, and welcome dance",
        details:
          "Guests arrive at the village, are greeted by the host family and invited to join the traditional welcome dance. Brief safety/orientation and introductions to Maasai customs.",
      },
      {
        order: 2,
        time: "08:30 – 09:30",
        activity: "Village tour: homesteads, cattle, beadwork demonstration",
        details:
          "A guided walk through the enkang (homestead) to see housing, cattle kraals, and daily life. Watch a beadwork demonstration and learn the meaning behind colors and patterns.",
      },
      {
        order: 3,
        time: "09:30 – 10:30",
        activity: "Goat slaughtering, roasting, and sharing the meal",
        details:
          "Participate (or observe respectfully) in traditional goat slaughtering and communal cooking. Sample the roasted meal and learn about food preparation and sharing rituals.",
      },
      {
        order: 4,
        time: "10:30 – 11:30",
        activity: "Elder storytelling session around the fire",
        details:
          "Sit with village elders as they share stories, myths, and histories of the Maasai people. Opportunity for Q&A about customs, rites of passage and local life.",
      },
      {
        order: 5,
        time: "11:30 – 12:00",
        activity: "Farewell songs, photos, and closing ceremony",
        details:
          "Final songs and traditional farewell, group photos, exchange of thanks and optional chance to purchase beadwork or crafts directly from artisans.",
      },
    ],
  },

  {
    id: "mto-002",
    title: "Nairobi Street Food Walk",
    slug: "nairobi-street-food-walk",
    location: "Nairobi, Kenya",
    duration: "3 days 2 nights",
    price: "$30",
    packageType: "MULTI_DAY",
    maxPackageDays: 3,
    maxGuests: 8,
    maxRooms: 3,
    image:
      "https://images.unsplash.com/photo-1533777324565-a040eb52fac2?w=1200&q=60",
    excerpt: "Taste local favorites and meet vendor partners.",
    host: {
      name: "Chef Ken",
      avatar:
        "https://images.unsplash.com/photo-1541647376587-5b9b2f0c6a3b?w=200&q=60",
      phone: "+254712345678",
    },
    inventory: {
      "2025-10-10": { capacity: 8, booked: 6 },
    },
    itinerary: [
      {
        order: 1,
        time: "Day 1 - Morning",
        activity: "Market orientation & local breakfast",
        details: "Meet your guide in downtown Nairobi, enjoy chai and mandazi at a local kiosk.",
      },
      {
        order: 2,
        time: "Day 1 - Afternoon",
        activity: "Matatu ride & lunch tasting",
        details: "Hop on a matatu to Eastleigh and sample famous street meals with vendor stories.",
      },
      {
        order: 3,
        time: "Day 2",
        activity: "Food storytelling workshop",
        details: "Join a hands-on class with local chefs and storytellers about food and identity.",
      },
    ],
  },
];

/**
 * Helpers
 */
function parsePrice(priceStr) {
  if (!priceStr) return null;
  const num = parseFloat(priceStr.replace(/[^0-9.]/g, ""));
  return isNaN(num) ? null : num;
}

function parseLocation(locationStr) {
  if (!locationStr || typeof locationStr !== "string")
    return { region: null, country: null };
  const parts = locationStr.split(",").map((s) => s.trim());
  if (parts.length >= 2) {
    return { region: parts[0], country: parts.slice(1).join(",") };
  }
  return { region: locationStr, country: null };
}

function dateToUtcMidnight(dateStr) {
  return new Date(dateStr + "T00:00:00Z");
}

/**
 * Upsert Logic
 */
async function upsertExperience(ex) {
  const { region, country } = parseLocation(ex.location);
  const priceFrom = parsePrice(ex.price);

  const data = {
    id: ex.id ?? undefined,
    slug: ex.slug,
    title: ex.title,
    excerpt: ex.excerpt ?? null,
    overview: ex.overview ?? null,
    region,
    country,
    featured: !!ex.featured,
    lat: ex.lat ?? 0,
    lng: ex.lng ?? 0,
    coverImage: ex.image ?? ex.coverImage ?? "",
    tags: ex.tags ?? [],
    inclusions: ex.inclusions ?? [],
    exclusions: ex.exclusions ?? [],
    practicalInfo: ex.practicalInfo ?? null,
    host: ex.host ?? null,
    metaTitle: ex.metaTitle ?? null,
    metaDescription: ex.metaDescription ?? null,
    duration: ex.duration ?? null,
    packageType: ex.packageType ?? "DAY",
    maxPackageDays: ex.maxPackageDays ?? null,
    maxGuests: ex.maxGuests ?? null,
    maxRooms: ex.maxRooms ?? null,
    maxInfants: ex.maxInfants ?? null,
    priceFrom,
  };

  return prisma.experience.upsert({
    where: { slug: ex.slug },
    update: data,
    create: data,
  });
}

async function upsertInventory(experienceId, inventoryMap) {
  if (!inventoryMap) return;
  for (const [dateStr, obj] of Object.entries(inventoryMap)) {
    const date = dateToUtcMidnight(dateStr);
    const capacity = Number(obj.capacity ?? 0);
    const booked = Number(obj.booked ?? 0);
    await prisma.experienceInventory.upsert({
      where: { experienceId_date: { experienceId, date } },
      create: { experienceId, date, capacity, booked },
      update: { capacity, booked },
    });
  }
}

async function upsertBlockedDates(experienceId, blockedDates) {
  if (!Array.isArray(blockedDates)) return;
  for (const dateStr of blockedDates) {
    const date = dateToUtcMidnight(dateStr);
    await prisma.experienceBlockedDate.upsert({
      where: { experienceId_date: { experienceId, date } },
      create: { experienceId, date },
      update: {},
    });
  }
}

async function upsertItinerary(experienceId, itinerary) {
  if (!Array.isArray(itinerary)) return;

  // Clear existing itinerary for idempotency
  await prisma.itineraryItem.deleteMany({ where: { experienceId } });

  for (const item of itinerary) {
    await prisma.itineraryItem.create({
      data: {
        experience: { connect: { id: experienceId } }, // ✅ relation
        // map the original `order` into `day` (or set to null)
        day: item.order ?? null,
        time: item.time ?? null,
        // your sample data uses `activity` — map it to `title`
        title: item.activity ?? item.title ?? "Untitled",
        // your sample data uses `details` — map it to `description`
        description: item.details ?? item.description ?? "",
        durationMinutes: item.durationMinutes ?? null,
        applicableDurations: item.applicableDurations ?? [],
        mealIncluded: item.mealIncluded ?? false,
      },
    });
  }
}



/**
 * Main Seeder
 */
async function main() {
  console.log(`🌍 Seeding ${EXPERIENCES_SAMPLE.length} experiences...`);

  for (const ex of EXPERIENCES_SAMPLE) {
    try {
      const experience = await upsertExperience(ex);
      console.log(`✅ Upserted: ${experience.title}`);

      if (ex.inventory) await upsertInventory(experience.id, ex.inventory);
      if (ex.blockedDates)
        await upsertBlockedDates(experience.id, ex.blockedDates);
      if (ex.itinerary)
        await upsertItinerary(experience.id, ex.itinerary);
    } catch (err) {
      console.error(`❌ Error for ${ex.slug}:`, err);
    }
  }

  console.log("✨ Seeding complete!");
}

main()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
