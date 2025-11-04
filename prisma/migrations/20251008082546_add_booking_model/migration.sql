-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('HOLD', 'CONFIRMED', 'CANCELLED', 'EXPIRED');

-- AlterTable
ALTER TABLE "DurationOption" ADD COLUMN     "inventory" INTEGER,
ADD COLUMN     "priceModel" TEXT;

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "durationOptionId" TEXT,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3) NOT NULL,
    "nights" INTEGER NOT NULL,
    "adults" INTEGER NOT NULL,
    "children" INTEGER NOT NULL,
    "infants" INTEGER NOT NULL,
    "rooms" INTEGER NOT NULL,
    "unitsBooked" INTEGER NOT NULL,
    "totalPrice" DOUBLE PRECISION,
    "currency" TEXT,
    "status" "BookingStatus" NOT NULL DEFAULT 'HOLD',
    "holdTokenHash" TEXT,
    "holdExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Booking_destinationId_idx" ON "Booking"("destinationId");

-- CreateIndex
CREATE INDEX "Booking_durationOptionId_idx" ON "Booking"("durationOptionId");

-- CreateIndex
CREATE INDEX "Booking_status_idx" ON "Booking"("status");

-- CreateIndex
CREATE INDEX "Booking_holdExpiresAt_idx" ON "Booking"("holdExpiresAt");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_durationOptionId_fkey" FOREIGN KEY ("durationOptionId") REFERENCES "DurationOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
