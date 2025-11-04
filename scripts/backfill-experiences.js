// scripts/backfill-experiences.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Fetching destinations...');
  const destinations = await prisma.destination.findMany();

  for (const dest of destinations) {
    // create a minimal Experience from Destination
    const exp = await prisma.experience.create({
      data: {
        slug: dest.slug + '-exp', // ensure unique slug - adapt as you need
        title: dest.title,
        subtitle: dest.subtitle ?? null,
        excerpt: dest.excerpt ?? null,
        country: dest.country ?? null,
        region: dest.region ?? null,
        featured: dest.featured ?? false,
        lat: dest.lat ?? 0,
        lng: dest.lng ?? 0,
        coverImage: dest.coverImage,
        tags: dest.tags ?? [],
        inclusions: dest.inclusions ?? [],
        exclusions: dest.exclusions ?? [],
        practicalInfo: dest.practicalInfo ?? null,
      },
    });

    console.log(`Created experience ${exp.id} for destination ${dest.id}`);

    // update related tables that currently reference the destination
    // Note: do these in reasonable batches for large data sets.
    await prisma.$transaction([
      prisma.durationOption.updateMany({
        where: { destinationId: dest.id },
        data: { experienceId: exp.id },
      }),
      prisma.gallery.updateMany({
        where: { destinationId: dest.id },
        data: { experienceId: exp.id },
      }),
      prisma.itineraryItem.updateMany({
        where: { destinationId: dest.id },
        data: { experienceId: exp.id },
      }),
      prisma.review.updateMany({
        where: { destinationId: dest.id },
        data: { experienceId: exp.id },
      }),
      prisma.booking.updateMany({
        where: { destinationId: dest.id },
        data: { experienceId: exp.id },
      }),
    ]);

    console.log(`Mapped rows for destination ${dest.id} -> experience ${exp.id}`);
  }

  console.log('Backfill complete.');
}

main()
  .catch((e) => {
    console.error('Error', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
