/*
  Warnings:

  - You are about to drop the column `subtitle` on the `Experience` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Experience" DROP COLUMN "subtitle",
ADD COLUMN     "overview" TEXT;
