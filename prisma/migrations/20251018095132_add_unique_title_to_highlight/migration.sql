/*
  Warnings:

  - A unique constraint covering the columns `[title]` on the table `highlights` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "highlights_title_key" ON "highlights"("title");
