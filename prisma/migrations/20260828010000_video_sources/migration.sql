-- CreateTable
CREATE TABLE "video_sources" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "masterKey" TEXT NOT NULL,
    "label" TEXT,
    "resolution" "Resolution" NOT NULL DEFAULT 'FHD_1080P',
    "durationSec" INTEGER,
    "requiresAuth" BOOLEAN NOT NULL DEFAULT false,
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "video_sources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "video_sources_episodeId_status_idx" ON "video_sources"("episodeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "video_sources_episodeId_masterKey_key" ON "video_sources"("episodeId", "masterKey");

-- AddForeignKey
ALTER TABLE "video_sources" ADD CONSTRAINT "video_sources_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_sources" ADD CONSTRAINT "video_sources_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

