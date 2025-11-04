-- CreateTable
CREATE TABLE "about_pages" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "heroTitle" TEXT NOT NULL,
    "heroEyebrow" TEXT,
    "heroDesc" TEXT,
    "heroImage" TEXT,
    "missionTitle" TEXT,
    "missionParagraphs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "about_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Value" (
    "id" TEXT NOT NULL,
    "aboutId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "desc" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Value_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "aboutId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "bio" TEXT,
    "photo" TEXT,
    "social" JSONB,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stat" (
    "id" TEXT NOT NULL,
    "aboutId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Stat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineItem" (
    "id" TEXT NOT NULL,
    "aboutId" TEXT NOT NULL,
    "year" TEXT NOT NULL,
    "text" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TimelineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FAQ" (
    "id" TEXT NOT NULL,
    "aboutId" TEXT NOT NULL,
    "q" TEXT NOT NULL,
    "a" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FAQ_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "about_pages_slug_key" ON "about_pages"("slug");

-- CreateIndex
CREATE INDEX "Value_aboutId_idx" ON "Value"("aboutId");

-- CreateIndex
CREATE INDEX "TeamMember_aboutId_idx" ON "TeamMember"("aboutId");

-- CreateIndex
CREATE INDEX "Stat_aboutId_idx" ON "Stat"("aboutId");

-- CreateIndex
CREATE INDEX "TimelineItem_aboutId_idx" ON "TimelineItem"("aboutId");

-- CreateIndex
CREATE INDEX "FAQ_aboutId_idx" ON "FAQ"("aboutId");

-- AddForeignKey
ALTER TABLE "Value" ADD CONSTRAINT "Value_aboutId_fkey" FOREIGN KEY ("aboutId") REFERENCES "about_pages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_aboutId_fkey" FOREIGN KEY ("aboutId") REFERENCES "about_pages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stat" ADD CONSTRAINT "Stat_aboutId_fkey" FOREIGN KEY ("aboutId") REFERENCES "about_pages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineItem" ADD CONSTRAINT "TimelineItem_aboutId_fkey" FOREIGN KEY ("aboutId") REFERENCES "about_pages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FAQ" ADD CONSTRAINT "FAQ_aboutId_fkey" FOREIGN KEY ("aboutId") REFERENCES "about_pages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
