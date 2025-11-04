-- DropForeignKey
ALTER TABLE "ItineraryItem" DROP CONSTRAINT "ItineraryItem_destinationId_fkey";

-- AlterTable
ALTER TABLE "ItineraryItem" ALTER COLUMN "destinationId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "ItineraryItem_experienceId_idx" ON "ItineraryItem"("experienceId");

-- AddForeignKey
ALTER TABLE "ItineraryItem" ADD CONSTRAINT "ItineraryItem_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE SET NULL ON UPDATE CASCADE;
