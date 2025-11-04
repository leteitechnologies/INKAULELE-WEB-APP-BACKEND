-- AlterEnum
ALTER TYPE "BookingStatus" ADD VALUE 'PENDING_SUPPLIER_CONFIRMATION';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "voucherGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "voucherToken" TEXT,
ADD COLUMN     "voucherTokenHash" TEXT,
ADD COLUMN     "voucherUrl" TEXT;
