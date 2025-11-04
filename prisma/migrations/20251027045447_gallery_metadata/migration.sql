-- AlterTable
ALTER TABLE "Gallery" ADD COLUMN     "alt" TEXT,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "groupId" TEXT,
ADD COLUMN     "title" TEXT,
ALTER COLUMN "order" SET DEFAULT 0;

-- CreateIndex
CREATE INDEX "Gallery_destinationId_idx" ON "Gallery"("destinationId");

-- CreateIndex
CREATE INDEX "Gallery_order_idx" ON "Gallery"("order");
