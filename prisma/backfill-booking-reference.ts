// scripts/backfill-booking-reference.ts
import { PrismaClient } from "@prisma/client";
import { generateUniqueBookingReference } from "../src/utils/reference";

const prisma = new PrismaClient();

async function backfill() {
  try {
    const bookings = await prisma.booking.findMany({ where: { reference: null }, select: { id: true } });

    for (const b of bookings) {
      const reference = await generateUniqueBookingReference(prisma);
      await prisma.booking.update({
        where: { id: b.id },
        data: { reference },
      });
      console.log(`Backfilled ${b.id} -> ${reference}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

backfill().catch((e) => {
  console.error(e);
  process.exit(1);
});
