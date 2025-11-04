/*
  Warnings:

  - A unique constraint covering the columns `[publicId]` on the table `SupplierVoucher` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "SupplierVoucher_publicId_key" ON "SupplierVoucher"("publicId");
