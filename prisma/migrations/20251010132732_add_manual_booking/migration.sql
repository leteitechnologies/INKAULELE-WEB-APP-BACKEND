-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "autoGenerateVoucher" BOOLEAN DEFAULT true,
ADD COLUMN     "voucherGenerationRequestedAt" TIMESTAMP(3);
