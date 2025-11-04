import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function seedTestimonials() {
  const rows = [
    {
      author: "Emily J.",
      quote: "Best cultural experience — unforgettable!",
      photo: "https://randomuser.me/api/portraits/women/44.jpg",
      role: "Guest",
      order: 0,
    },
    {
      author: "Marco P.",
      quote: "A deeply authentic trip. Highly recommended.",
      photo: "https://randomuser.me/api/portraits/men/32.jpg",
      role: "Guest",
      order: 1,
    },
  ];

  for (const r of rows) {
    // Try to find a matching testimonial by author & quote
    const existing = await prisma.testimonial.findFirst({
      where: {
        author: r.author,
        quote: r.quote,
      },
    });

    if (existing) {
      // Update existing testimonial
      await prisma.testimonial.update({
        where: { id: existing.id },
        data: {
          quote: r.quote,
          photo: r.photo,
          role: r.role,
          active: true,
          order: r.order,
        },
      });
    } else {
      // Create a new testimonial
      await prisma.testimonial.create({
        data: {
          author: r.author,
          quote: r.quote,
          photo: r.photo,
          role: r.role,
          active: true,
          order: r.order,
        },
      });
    }
  }

  console.log("✅ Seeded testimonials successfully");
}

async function main() {
  await seedTestimonials();
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
