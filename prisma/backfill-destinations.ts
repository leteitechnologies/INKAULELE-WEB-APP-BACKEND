// scripts/backfill-destinations.ts
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // Backfill from destination table
  const rows = await prisma.bookingEnquiry.findMany({
    where: { destinationTitle: null, destinationId: { not: null } },
  });

  for (const r of rows) {
    const dest = await prisma.destination.findUnique({ where: { id: String(r.destinationId) } });
    if (dest?.title) {
      await prisma.bookingEnquiry.update({
        where: { id: r.id },
        data: { destinationTitle: dest.title },
      });
      console.log("Updated", r.id, "->", dest.title);
    }
  }

  // Backfill from experience table
  const rowsExp = await prisma.bookingEnquiry.findMany({
    where: { experienceTitle: null, experienceId: { not: null } },
  });
  for (const r of rowsExp) {
    const exp = await prisma.experience.findUnique({ where: { id: String(r.experienceId) } });
    if (exp?.title) {
      await prisma.bookingEnquiry.update({
        where: { id: r.id },
        data: { experienceTitle: exp.title },
      });
      console.log("Updated experience", r.id, "->", exp.title);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => process.exit());
