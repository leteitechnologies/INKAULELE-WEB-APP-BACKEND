// prisma/seed.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const gallerySeed = [
  { id: "g1-01", groupId: "g1", src: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1600&q=60", alt: "Safari Jeep in Maasai Mara — 1", title: "Safari Jeep — 1", featured: true, category: "Safari", caption: "Jeep on the Mara plains", shortAlt: "Safari jeep" },
  { id: "g1-02", groupId: "g1", src: "https://images.unsplash.com/photo-1508672019048-805c876b67e2?w=1600&q=60", alt: "Safari Jeep in Maasai Mara — 2", title: "Safari Jeep — 2", category: "Safari", caption: "Sunset drive", shortAlt: "Jeep sunset" },
  { id: "g1-03", groupId: "g1", src: "https://images.unsplash.com/photo-1519985176271-adb1088fa94c?w=1600&q=60", alt: "Safari scene — 3", title: "Safari Jeep — 3", category: "Safari", caption: "Wildlife spotting", shortAlt: "Safari scene" },

  { id: "g2-01", groupId: "g2", src: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1600&q=60", alt: "Traditional Maasai Dance", title: "Cultural Dance", category: "Culture", caption: "Maasai traditional dance", shortAlt: "Maasai dance" },
  { id: "g2-02", groupId: "g2", src: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=1600&q=60", alt: "Village storytelling", title: "Village Story", category: "Culture", caption: "Storytelling by the fireside", shortAlt: "Village story" },

  { id: "g3-01", src: "https://images.unsplash.com/photo-1523413651479-597eb2da0ad6?w=1600&q=60", alt: "Kenyan Street Food Market", title: "Food Market", category: "Food", caption: "Local street food hub", shortAlt: "Food market" },

  { id: "g4-01", src: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1600&q=60", alt: "Sunset at Diani Beach", title: "Diani Beach", category: "Coast", caption: "Diani beach sunset", shortAlt: "Diani beach sunset" },

  { id: "g5-01", groupId: "g5", src: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1600&q=60", alt: "Lions in Amboseli", title: "Lions in Amboseli", category: "Wildlife", caption: "Lions roaming the plain", shortAlt: "Lions" },
  { id: "g5-02", groupId: "g5", src: "https://images.unsplash.com/photo-1500534623283-312aade485b7?w=1600&q=60", alt: "Elephant family at dusk", title: "Elephants at Dusk", category: "Wildlife", caption: "Elephant family", shortAlt: "Elephants" },

  { id: "g6-01", src: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1600&q=60", alt: "Nairobi skyline at twilight", title: "City Skyline", category: "City", caption: "Nairobi skyline", shortAlt: "City skyline" },

  { id: "g7-01", src: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1600&q=60", alt: "Hiking trail over volcanic landscape", title: "Adventure Hike", category: "Adventure", caption: "Volcanic hiking trail", shortAlt: "Hike trail" },

  { id: "g8-01", src: "https://images.unsplash.com/photo-1516910817561-ec4fb8fc7f7e?w=1600&q=60", alt: "Local market and community gathering", title: "Community Market", category: "Community", caption: "Local market", shortAlt: "Community market" },

  { id: "g9-01", src: "https://images.unsplash.com/photo-1532298229144-0ec0c57515c7?w=1600&q=60", alt: "Field conservation team tagging a rhino", title: "Conservation Work", category: "Conservation", caption: "Conservation fieldwork", shortAlt: "Conservation" },

  { id: "g10-01", src: "https://images.unsplash.com/photo-1500530855697-1a2f6a9d0d03?w=1600&q=60", alt: "Colorful malachite kingfisher", title: "Birdlife", category: "Birdlife", caption: "Kingfisher on a branch", shortAlt: "Kingfisher" },
];

async function main() {
  console.log("Reseeding gallery (no destination attachment)...");

  for (let i = 0; i < gallerySeed.length; i++) {
    const item = gallerySeed[i];

    // normalized data shape for DB
    const createData: any = {
      id: item.id,
      imageUrl: item.src,
      alt: item.alt ?? null,
      shortAlt: item.shortAlt ?? null,
      title: item.title ?? null,
      caption: item.caption ?? null,
      category: item.category ?? null,
      groupId: item.groupId ?? null,
      featured: Boolean(item.featured ?? false),
      order: i,
    };

    // For upsert, include destinationId: null in update to detach previous attachments
    await prisma.gallery.upsert({
      where: { id: item.id },
      update: { ...createData, destinationId: null },
      create: createData,
    });

    console.log(`Upserted gallery ${item.id} — ${item.title}`);
  }

  console.log("Gallery reseed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
