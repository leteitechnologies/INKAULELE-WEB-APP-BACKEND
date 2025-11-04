/*
  Warnings:

  - The `priceModel` column on the `DurationOption` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "PriceModel" AS ENUM ('PER_PERSON', 'PER_ROOM', 'PER_BOOKING');

-- AlterTable
ALTER TABLE "DurationOption" DROP COLUMN "priceModel",
ADD COLUMN     "priceModel" "PriceModel";
