-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "stripePaymentIntentId" TEXT,
ADD COLUMN     "stripePaymentIntentStatus" TEXT;
