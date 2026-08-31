-- CreateEnum
CREATE TYPE "VideoSourceKind" AS ENUM ('HLS_PROXY', 'DIRECT_FILE', 'EMBED');

-- DropIndex
DROP INDEX "video_sources_episodeId_masterKey_key";

-- DropIndex
DROP INDEX "video_sources_episodeId_status_idx";

-- AlterTable
ALTER TABLE "video_sources" ADD COLUMN     "allowPopups" BOOLEAN,
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "kind" "VideoSourceKind" NOT NULL DEFAULT 'HLS_PROXY',
ADD COLUMN     "providerId" TEXT,
ADD COLUMN     "proxied" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sourceUrl" TEXT,
ALTER COLUMN "masterKey" DROP NOT NULL;

-- CreateTable
CREATE TABLE "video_providers" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "VideoSourceKind" NOT NULL DEFAULT 'EMBED',
    "embedTemplate" TEXT,
    "urlPatterns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "domains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowPopups" BOOLEAN NOT NULL DEFAULT false,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_providers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "video_providers_slug_key" ON "video_providers"("slug");

-- CreateIndex
CREATE INDEX "video_providers_isEnabled_sortOrder_idx" ON "video_providers"("isEnabled", "sortOrder");

-- CreateIndex
CREATE INDEX "video_sources_episodeId_status_sortOrder_idx" ON "video_sources"("episodeId", "status", "sortOrder");

-- CreateIndex
CREATE INDEX "video_sources_providerId_idx" ON "video_sources"("providerId");

-- AddForeignKey
ALTER TABLE "video_sources" ADD CONSTRAINT "video_sources_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "video_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

