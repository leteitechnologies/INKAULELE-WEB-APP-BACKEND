// src/utils/reference.ts
import { customAlphabet } from "nanoid";
import type { PrismaClient } from "@prisma/client"; // keep typing

const nano = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6);

export async function generateUniqueBookingReference(prisma: PrismaClient | any, maxAttempts = 5) {
  for (let i = 0; i < maxAttempts; i++) {
    const ref = `BK-${nano()}`;
    const existing = await prisma.booking.findUnique({ where: { reference: ref } }); // ok once client regenerated
    if (!existing) return ref;
  }
  throw new Error("Failed to generate unique booking reference after several attempts");
}
