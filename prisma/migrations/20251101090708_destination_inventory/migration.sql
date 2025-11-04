-- CreateTable
CREATE TABLE "DestinationInventory" (
    "id" SERIAL NOT NULL,
    "destinationId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DestinationInventory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DestinationInventory_date_idx" ON "DestinationInventory"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DestinationInventory_destinationId_date_key" ON "DestinationInventory"("destinationId", "date");

-- AddForeignKey
ALTER TABLE "DestinationInventory" ADD CONSTRAINT "DestinationInventory_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
