-- DropForeignKey
ALTER TABLE "Review" DROP CONSTRAINT "Review_experienceId_fkey";

-- AlterTable
ALTER TABLE "Review" ALTER COLUMN "experienceId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_experienceId_fkey" FOREIGN KEY ("experienceId") REFERENCES "Experience"("id") ON DELETE SET NULL ON UPDATE CASCADE;
