/*
  Warnings:

  - You are about to drop the `DestinationInventory` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ExperienceInventory` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "DestinationInventory" DROP CONSTRAINT "DestinationInventory_destinationId_fkey";

-- DropForeignKey
ALTER TABLE "ExperienceInventory" DROP CONSTRAINT "ExperienceInventory_experienceId_fkey";

-- DropTable
DROP TABLE "DestinationInventory";

-- DropTable
DROP TABLE "ExperienceInventory";

-- CreateTable
CREATE TABLE "DurationInventory" (
    "id" SERIAL NOT NULL,
    "durationOptionId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "booked" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DurationInventory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DurationInventory_date_idx" ON "DurationInventory"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DurationInventory_durationOptionId_date_key" ON "DurationInventory"("durationOptionId", "date");

-- AddForeignKey
ALTER TABLE "DurationInventory" ADD CONSTRAINT "DurationInventory_durationOptionId_fkey" FOREIGN KEY ("durationOptionId") REFERENCES "DurationOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
