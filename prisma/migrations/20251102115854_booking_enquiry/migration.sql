-- CreateTable
CREATE TABLE "BookingEnquiry" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT,
    "hostId" TEXT,
    "destinationId" TEXT,
    "experienceId" TEXT,
    "durationOptionId" TEXT,
    "durationTitle" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "nights" INTEGER,
    "guests" JSONB,
    "rooms" INTEGER,
    "message" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "currency" TEXT,
    "priceEstimate" DOUBLE PRECISION,
    "meta" JSONB,
    "adminNotified" BOOLEAN NOT NULL DEFAULT false,
    "hostNotified" BOOLEAN NOT NULL DEFAULT false,
    "hostEmailUsed" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingEnquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BookingEnquiry_hostId_idx" ON "BookingEnquiry"("hostId");

-- CreateIndex
CREATE INDEX "BookingEnquiry_destinationId_idx" ON "BookingEnquiry"("destinationId");

-- CreateIndex
CREATE INDEX "BookingEnquiry_experienceId_idx" ON "BookingEnquiry"("experienceId");

-- CreateIndex
CREATE INDEX "BookingEnquiry_durationOptionId_idx" ON "BookingEnquiry"("durationOptionId");

-- CreateIndex
CREATE INDEX "BookingEnquiry_email_idx" ON "BookingEnquiry"("email");

-- AddForeignKey
ALTER TABLE "BookingEnquiry" ADD CONSTRAINT "BookingEnquiry_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingEnquiry" ADD CONSTRAINT "BookingEnquiry_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "Host"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingEnquiry" ADD CONSTRAINT "BookingEnquiry_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingEnquiry" ADD CONSTRAINT "BookingEnquiry_experienceId_fkey" FOREIGN KEY ("experienceId") REFERENCES "Experience"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingEnquiry" ADD CONSTRAINT "BookingEnquiry_durationOptionId_fkey" FOREIGN KEY ("durationOptionId") REFERENCES "DurationOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
