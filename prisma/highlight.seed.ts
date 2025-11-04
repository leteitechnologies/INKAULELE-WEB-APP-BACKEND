// prisma/seed.ts
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const seedHighlights = [
    { title: "Guided by Locals", desc: "Every journey is led by hosts who share their land, language, and traditions with pride.", icon: "GlobeAltIcon", order: 0 },
    { title: "Small & Personal", desc: "We keep groups intimate so you can sit by the fire, join the dance, and feel part of the moment.", icon: "SparklesIcon", order: 1 },
    { title: "Hidden Cultural Paths", desc: "Discover village rituals, food traditions, and landscapes far beyond the tourist trail.", icon: "MapIcon", order: 2 },
    { title: "Respect & Trust", desc: "We honor the communities we work with, ensuring your visit supports and protects local ways of life.", icon: "ShieldCheckIcon", order: 3 },
  ];

  for (const h of seedHighlights) {
    await prisma.highlight.upsert({
      where: { title: h.title },
      update: {
        desc: h.desc,
        icon: h.icon,
        order: h.order,
        active: true,
      },
      create: {
        title: h.title,
        desc: h.desc,
        icon: h.icon,
        order: h.order,
        active: true,
      },
    });
  }

  console.log("Seeded highlights");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
