-- CreateTable
CREATE TABLE "campaign_destinations" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_destinations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaign_destinations_campaignId_idx" ON "campaign_destinations"("campaignId");

-- CreateIndex
CREATE INDEX "campaign_destinations_destinationId_idx" ON "campaign_destinations"("destinationId");

-- AddForeignKey
ALTER TABLE "campaign_destinations" ADD CONSTRAINT "campaign_destinations_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_destinations" ADD CONSTRAINT "campaign_destinations_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
