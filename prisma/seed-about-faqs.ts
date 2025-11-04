// prisma/seed-about-faqs.ts
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const slug = "about";

  // upsert AboutPage (keeps other fields minimal for seeding FAQ)
  const about = await prisma.aboutPage.upsert({
    where: { slug },
    create: {
      slug,
      heroTitle: "We connect curious travellers with authentic Kenyan culture",
      heroEyebrow: "About us",
      heroDesc:
        "Locally-led tours, community experiences and sustainable journeys across Kenya. We design intimate, meaningful encounters from coastal Swahili towns to Maasai-led village evenings.",
      heroImage:
        "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1400&q=60",
      missionTitle: "Our mission",
      missionParagraphs: [
        "Build meaningful cultural exchange between visitors and hosts.",
        "Empower local communities by creating long-term income and training opportunities.",
      ],
    },
    update: {
      // keep existing values, but ensure these base fields exist
      heroTitle: "We connect curious travellers with authentic Kenyan culture",
      heroImage:
        "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1400&q=60",
      missionTitle: "Our mission",
      missionParagraphs: [
        "Build meaningful cultural exchange between visitors and hosts.",
        "Empower local communities by creating long-term income and training opportunities.",
      ],
    },
  });

  // FAQ array (em dash removed; punctuation changed to avoid the banned character)
  const faqs = [
    {
      q: "Are the destinations suitable for children?",
      a:
        "Absolutely. Many experiences are family-friendly and invite children to learn through play, storytelling, and hands-on discovery. Families often leave with new friendships and a deeper sense of connection.",
    },
    {
      q: "How do you choose the communities you work with?",
      a:
        "We work hand in hand with local leaders, artisans, and elders who wish to share their culture in a genuine way. Each partnership grows from trust, respect, and a shared goal of keeping traditions alive while improving livelihoods.",
    },
    {
      q: "Where in Kenya can I travel with Inkaulele?",
      a:
        "From the quiet coastal villages to the vast Maasai plains, from green highlands to the Rift Valley’s heart. Every journey opens a different side of Kenya’s spirit, and each place has its own rhythm and story to share.",
    },
    {
      q: "Do you support sustainable tourism?",
      a:
        "Yes. Every trip helps preserve what makes these places special. A portion of each booking supports education, conservation, and cultural programs led by the communities themselves.",
    },
    {
      q: "Can I request a personalized trip?",
      a:
        "Of course. We will help you shape a journey that reflects your interests, whether that means cooking with local families, learning traditional crafts, or exploring untouched natural landscapes.",
    },
    {
      q: "How do I reach the destinations?",
      a:
        "Once you book, we provide detailed travel guidance for each location. For remote regions, our team can help arrange safe transport or connect you with trusted local drivers who know the land best.",
    },
    {
      q: "What should I pack or wear?",
      a:
        "Pack light, travel easy, and come with curiosity. Comfortable clothing and an open heart go a long way. Some communities may suggest specific attire for cultural respect or local climate.",
    },
    {
      q: "Does my visit benefit local people?",
      a:
        "Yes. Most of what you pay goes directly to hosts, guides, and community projects. Your presence helps create lasting impact, supporting families, preserving culture, and keeping local stories alive.",
    },
  ];

  // upsert FAQs (idempotent, deterministic ids using about.id)
  await Promise.all(
    faqs.map((f, i) =>
      prisma.fAQ.upsert({
        where: { id: `${about.id}-f-${i}` },
        create: {
          id: `${about.id}-f-${i}`,
          aboutId: about.id,
          q: f.q,
          a: f.a,
          order: i,
        },
        update: {
          q: f.q,
          a: f.a,
          order: i,
        },
      })
    )
  );

  console.log("About page FAQs seeded successfully");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
