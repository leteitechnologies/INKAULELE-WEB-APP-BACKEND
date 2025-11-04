/*
  Warnings:

  - Made the column `experienceId` on table `DurationOption` required. This step will fail if there are existing NULL values in that column.
  - Made the column `experienceId` on table `Gallery` required. This step will fail if there are existing NULL values in that column.
  - Made the column `experienceId` on table `ItineraryItem` required. This step will fail if there are existing NULL values in that column.
  - Made the column `experienceId` on table `Review` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "DurationOption" DROP CONSTRAINT "DurationOption_experienceId_fkey";

-- DropForeignKey
ALTER TABLE "Gallery" DROP CONSTRAINT "Gallery_experienceId_fkey";

-- DropForeignKey
ALTER TABLE "ItineraryItem" DROP CONSTRAINT "ItineraryItem_experienceId_fkey";

-- DropForeignKey
ALTER TABLE "Review" DROP CONSTRAINT "Review_experienceId_fkey";

-- AlterTable
ALTER TABLE "DurationOption" ALTER COLUMN "experienceId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Gallery" ALTER COLUMN "experienceId" SET NOT NULL;

-- AlterTable
ALTER TABLE "ItineraryItem" ALTER COLUMN "experienceId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Review" ALTER COLUMN "experienceId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "DurationOption" ADD CONSTRAINT "DurationOption_experienceId_fkey" FOREIGN KEY ("experienceId") REFERENCES "Experience"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItineraryItem" ADD CONSTRAINT "ItineraryItem_experienceId_fkey" FOREIGN KEY ("experienceId") REFERENCES "Experience"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gallery" ADD CONSTRAINT "Gallery_experienceId_fkey" FOREIGN KEY ("experienceId") REFERENCES "Experience"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_experienceId_fkey" FOREIGN KEY ("experienceId") REFERENCES "Experience"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
