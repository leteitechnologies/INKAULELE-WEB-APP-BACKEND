-- AlterTable
ALTER TABLE "ContactRequest" ADD COLUMN     "lastRepliedAt" TIMESTAMP(3),
ADD COLUMN     "viewed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "viewedAt" TIMESTAMP(3);
