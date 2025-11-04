-- DropForeignKey
ALTER TABLE "DurationOption" DROP CONSTRAINT "DurationOption_experienceId_fkey";

-- DropForeignKey
ALTER TABLE "Gallery" DROP CONSTRAINT "Gallery_experienceId_fkey";

-- DropForeignKey
ALTER TABLE "ItineraryItem" DROP CONSTRAINT "ItineraryItem_experienceId_fkey";

-- AlterTable
ALTER TABLE "DurationOption" ALTER COLUMN "experienceId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Gallery" ALTER COLUMN "experienceId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ItineraryItem" ALTER COLUMN "experienceId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "DurationOption" ADD CONSTRAINT "DurationOption_experienceId_fkey" FOREIGN KEY ("experienceId") REFERENCES "Experience"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItineraryItem" ADD CONSTRAINT "ItineraryItem_experienceId_fkey" FOREIGN KEY ("experienceId") REFERENCES "Experience"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gallery" ADD CONSTRAINT "Gallery_experienceId_fkey" FOREIGN KEY ("experienceId") REFERENCES "Experience"("id") ON DELETE SET NULL ON UPDATE CASCADE;
