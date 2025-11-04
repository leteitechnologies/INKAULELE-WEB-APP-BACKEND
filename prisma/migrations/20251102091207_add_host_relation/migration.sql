/*
  Warnings:

  - You are about to drop the column `host` on the `Destination` table. All the data in the column will be lost.
  - You are about to drop the column `host` on the `Experience` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Destination" DROP COLUMN "host",
ADD COLUMN     "hostId" TEXT;

-- AlterTable
ALTER TABLE "Experience" DROP COLUMN "host",
ADD COLUMN     "hostId" TEXT;

-- CreateTable
CREATE TABLE "Host" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "avatar" TEXT,
    "about" TEXT,

    CONSTRAINT "Host_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Host_email_key" ON "Host"("email");

-- AddForeignKey
ALTER TABLE "Destination" ADD CONSTRAINT "Destination_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "Host"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experience" ADD CONSTRAINT "Experience_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "Host"("id") ON DELETE SET NULL ON UPDATE CASCADE;
