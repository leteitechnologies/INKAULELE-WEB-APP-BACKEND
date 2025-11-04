-- CreateTable
CREATE TABLE "TravelPack" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "filename" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TravelPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierVoucher" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "supplierName" TEXT,
    "supplierType" TEXT,
    "supplierRef" TEXT,
    "publicId" TEXT NOT NULL,
    "filename" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailedAt" TIMESTAMP(3),
    "contactJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierVoucher_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TravelPack_bookingId_key" ON "TravelPack"("bookingId");

-- CreateIndex
CREATE INDEX "TravelPack_publicId_idx" ON "TravelPack"("publicId");

-- CreateIndex
CREATE INDEX "SupplierVoucher_bookingId_idx" ON "SupplierVoucher"("bookingId");

-- CreateIndex
CREATE INDEX "SupplierVoucher_publicId_idx" ON "SupplierVoucher"("publicId");

-- AddForeignKey
ALTER TABLE "TravelPack" ADD CONSTRAINT "TravelPack_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierVoucher" ADD CONSTRAINT "SupplierVoucher_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
