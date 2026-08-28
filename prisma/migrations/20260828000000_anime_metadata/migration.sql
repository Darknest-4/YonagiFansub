-- AlterTable
ALTER TABLE "episodes" ADD COLUMN     "isFiller" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isRecap" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "metadataSyncedAt" TIMESTAMP(3),
ADD COLUMN     "titleRomaji" TEXT;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "autoSync" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "averageScore" INTEGER,
ADD COLUMN     "countryOfOrigin" VARCHAR(2),
ADD COLUMN     "endDate" DATE,
ADD COLUMN     "externalLinks" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "favourites" INTEGER,
ADD COLUMN     "hashtag" TEXT,
ADD COLUMN     "isAdult" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "licensors" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "malScore" DECIMAL(4,2),
ADD COLUMN     "metadataSource" VARCHAR(16),
ADD COLUMN     "metadataSyncedAt" TIMESTAMP(3),
ADD COLUMN     "popularity" INTEGER,
ADD COLUMN     "producers" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "relations" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "startDate" DATE,
ADD COLUMN     "studios" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "projects_autoSync_metadataSyncedAt_idx" ON "projects"("autoSync", "metadataSyncedAt");

