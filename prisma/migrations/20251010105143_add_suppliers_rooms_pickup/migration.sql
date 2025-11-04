/*
  Warnings:

  - Added the required column `supplierId` to the `SupplierVoucher` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "SupplierType" AS ENUM ('HOTEL', 'TRANSFER', 'GUIDE', 'ACTIVITY', 'RESTAURANT', 'OTHER');

-- CreateEnum
CREATE TYPE "PickupType" AS ENUM ('AIRPORT', 'PORT', 'HOTEL', 'MEETING_POINT');

-- CreateEnum
CREATE TYPE "PickupProvider" AS ENUM ('COMPANY', 'THIRD_PARTY', 'UBER', 'WALK', 'SHUTTLE');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('CAR', 'VAN', 'MINIBUS', 'FOUR_X_FOUR', 'MOTORBIKE');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "accommodationSupplierId" TEXT,
ADD COLUMN     "checkInAt" TIMESTAMP(3),
ADD COLUMN     "checkOutAt" TIMESTAMP(3),
ADD COLUMN     "flightNumber" TEXT,
ADD COLUMN     "pickupRequested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "roomId" TEXT,
ADD COLUMN     "specialRequests" TEXT;

-- AlterTable
ALTER TABLE "SupplierVoucher" ADD COLUMN     "supplierId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SupplierType" NOT NULL DEFAULT 'OTHER',
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "address" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "code" TEXT,
    "title" TEXT NOT NULL,
    "roomType" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 2,
    "inventory" INTEGER,
    "priceFrom" DOUBLE PRECISION,
    "currency" TEXT DEFAULT 'KES',
    "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pickup" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "type" "PickupType" NOT NULL,
    "provider" "PickupProvider" NOT NULL,
    "vehicleType" "VehicleType",
    "providerName" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "pickupAt" TIMESTAMP(3),
    "flightNumber" TEXT,

    CONSTRAINT "Pickup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Room_supplierId_idx" ON "Room"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "Pickup_bookingId_key" ON "Pickup"("bookingId");

-- CreateIndex
CREATE INDEX "SupplierVoucher_supplierId_idx" ON "SupplierVoucher"("supplierId");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_accommodationSupplierId_fkey" FOREIGN KEY ("accommodationSupplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierVoucher" ADD CONSTRAINT "SupplierVoucher_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
