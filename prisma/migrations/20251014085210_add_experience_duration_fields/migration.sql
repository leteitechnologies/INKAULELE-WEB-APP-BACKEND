-- CreateEnum
CREATE TYPE "PackageType" AS ENUM ('HOURLY', 'DAY', 'NIGHT', 'MULTI_DAY');

-- AlterTable
ALTER TABLE "Experience" ADD COLUMN     "maxGuests" INTEGER,
ADD COLUMN     "maxInfants" INTEGER,
ADD COLUMN     "maxPackageDays" INTEGER,
ADD COLUMN     "maxRooms" INTEGER,
ADD COLUMN     "packageType" "PackageType" NOT NULL DEFAULT 'DAY',
ADD COLUMN     "priceFrom" DOUBLE PRECISION;
