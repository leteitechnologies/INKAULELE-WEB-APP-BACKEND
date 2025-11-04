// prisma/updateSubtitles.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const updates = [
  {
    slug: "lamu-old-town",
    subtitle: "A place where the pace of life slows to the rhythm of the tides",
  },
  {
    slug: "manda-island",
    subtitle: "In the heart of the Lamu archipelago — quiet beaches & dhow trips",
  },
  {
    slug: "pate-island",
    subtitle: "Explore ancient ruins and traditional villages on Pate Island",
  },
  // add more slug/subtitle pairs here if needed
];

async function main() {
  for (const u of updates) {
    const res = await prisma.destination.updateMany({
      where: { slug: u.slug },
      data: { subtitle: u.subtitle },
    });
    console.log(`Updated ${u.slug}: matched=${res.count}`);
  }
  console.log("Done updating subtitles.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
