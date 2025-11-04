/*
  Warnings:

  - You are about to drop the `Page` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PageHighlight` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "PageHighlight" DROP CONSTRAINT "PageHighlight_highlightId_fkey";

-- DropForeignKey
ALTER TABLE "PageHighlight" DROP CONSTRAINT "PageHighlight_pageId_fkey";

-- DropTable
DROP TABLE "Page";

-- DropTable
DROP TABLE "PageHighlight";
