-- Videóplatform: állapotfigyelés, feliratsávok, lejátszási események, főcím-időzítés.
--
-- Mind additív: nincs oszlop, ami eltűnne, és nincs meglévő sor, ami átalakulna.
-- Ez szándékos — így az előző kódverzió is együtt tud élni ezzel a sémával, és
-- a migráció nem kér olyan zárat, amit egy futó példány fogna.

-- ── Főcím és végefőcím határai ───────────────────────────────────────────────
ALTER TABLE "episodes" ADD COLUMN IF NOT EXISTS "introStartSec" INTEGER;
ALTER TABLE "episodes" ADD COLUMN IF NOT EXISTS "introEndSec"   INTEGER;
ALTER TABLE "episodes" ADD COLUMN IF NOT EXISTS "outroStartSec" INTEGER;
ALTER TABLE "episodes" ADD COLUMN IF NOT EXISTS "outroEndSec"   INTEGER;

-- ── Forrás-metaadat, amiből a feloldó választ ────────────────────────────────
ALTER TABLE "video_sources" ADD COLUMN IF NOT EXISTS "bitrateKbps" INTEGER;
ALTER TABLE "video_sources" ADD COLUMN IF NOT EXISTS "isAdaptive"  BOOLEAN NOT NULL DEFAULT false;

-- A HLS master playlist eleve több változatot hordoz: ott az „Auto” valódi
-- adaptív bitráta. A meglévő sorokat ennek megfelelően jelöljük.
UPDATE "video_sources" SET "isAdaptive" = true WHERE "kind" = 'HLS_PROXY';

-- ── Szolgáltatói prioritás ───────────────────────────────────────────────────
ALTER TABLE "video_providers" ADD COLUMN IF NOT EXISTS "priority" INTEGER NOT NULL DEFAULT 100;

-- A meglévő kézi sorrend a prioritás kiindulópontja: eddig a `sortOrder` volt az
-- egyetlen rendezés, tehát a csapat szándéka abban van benne.
UPDATE "video_providers" SET "priority" = 100 + "sortOrder";

DROP INDEX IF EXISTS "video_providers_isEnabled_sortOrder_idx";
CREATE INDEX IF NOT EXISTS "video_providers_isEnabled_priority_sortOrder_idx"
  ON "video_providers" ("isEnabled", "priority", "sortOrder");

-- ── Állapot ──────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "VideoHealthStatus" AS ENUM ('UNKNOWN', 'ONLINE', 'DEGRADED', 'OFFLINE', 'MAINTENANCE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "video_source_health" (
  "id"               TEXT NOT NULL,
  "sourceId"         TEXT,
  "providerId"       TEXT,
  "status"           "VideoHealthStatus" NOT NULL DEFAULT 'UNKNOWN',
  "failureCount"     INTEGER NOT NULL DEFAULT 0,
  "averageLatencyMs" INTEGER,
  "lastError"        TEXT,
  "lastCheckedAt"    TIMESTAMP(3),
  "lastSuccessAt"    TIMESTAMP(3),
  "lastFailureAt"    TIMESTAMP(3),
  "isMaintenance"    BOOLEAN NOT NULL DEFAULT false,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "video_source_health_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "video_source_health_sourceId_key"
  ON "video_source_health" ("sourceId");
CREATE UNIQUE INDEX IF NOT EXISTS "video_source_health_providerId_key"
  ON "video_source_health" ("providerId");
CREATE INDEX IF NOT EXISTS "video_source_health_status_updatedAt_idx"
  ON "video_source_health" ("status", "updatedAt");

-- Pontosan az egyik szint: vagy forráshoz tartozik, vagy szolgáltatóhoz.
-- Enélkül keletkezhetne olyan sor, ami mindkettőhöz vagy egyikhez sem — és a
-- feloldó ilyet nem tud értelmezni.
ALTER TABLE "video_source_health" DROP CONSTRAINT IF EXISTS "video_source_health_one_target";
ALTER TABLE "video_source_health" ADD CONSTRAINT "video_source_health_one_target"
  CHECK (("sourceId" IS NULL) <> ("providerId" IS NULL));

ALTER TABLE "video_source_health" DROP CONSTRAINT IF EXISTS "video_source_health_sourceId_fkey";
ALTER TABLE "video_source_health" ADD CONSTRAINT "video_source_health_sourceId_fkey"
  FOREIGN KEY ("sourceId") REFERENCES "video_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "video_source_health" DROP CONSTRAINT IF EXISTS "video_source_health_providerId_fkey";
ALTER TABLE "video_source_health" ADD CONSTRAINT "video_source_health_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "video_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Feliratsávok ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "SubtitleFormat" AS ENUM ('ASS', 'SSA', 'SRT', 'VTT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "subtitle_tracks" (
  "id"                TEXT NOT NULL,
  "episodeId"         TEXT NOT NULL,
  "language"          TEXT NOT NULL DEFAULT 'hu',
  "label"             TEXT NOT NULL,
  "format"            "SubtitleFormat" NOT NULL DEFAULT 'ASS',
  "storageKey"        TEXT NOT NULL,
  "isDefault"         BOOLEAN NOT NULL DEFAULT false,
  "isForced"          BOOLEAN NOT NULL DEFAULT false,
  "isHearingImpaired" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder"         INTEGER NOT NULL DEFAULT 0,
  "status"            "PublishStatus" NOT NULL DEFAULT 'DRAFT',
  "createdById"       TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  "deletedAt"         TIMESTAMP(3),
  CONSTRAINT "subtitle_tracks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "subtitle_tracks_episodeId_status_sortOrder_idx"
  ON "subtitle_tracks" ("episodeId", "status", "sortOrder");

ALTER TABLE "subtitle_tracks" DROP CONSTRAINT IF EXISTS "subtitle_tracks_episodeId_fkey";
ALTER TABLE "subtitle_tracks" ADD CONSTRAINT "subtitle_tracks_episodeId_fkey"
  FOREIGN KEY ("episodeId") REFERENCES "episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "subtitle_tracks" DROP CONSTRAINT IF EXISTS "subtitle_tracks_createdById_fkey";
ALTER TABLE "subtitle_tracks" ADD CONSTRAINT "subtitle_tracks_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Lejátszási események ─────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "PlaybackEventType" AS ENUM
    ('PLAY', 'PAUSE', 'SEEK', 'BUFFERING', 'QUALITY_CHANGE', 'SOURCE_CHANGE', 'ERROR', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "playback_events" (
  "id"         TEXT NOT NULL,
  "episodeId"  TEXT NOT NULL,
  "sourceId"   TEXT,
  "providerId" TEXT,
  "userId"     TEXT,
  "type"       "PlaybackEventType" NOT NULL,
  "quality"    TEXT,
  "errorKind"  TEXT,
  "value"      INTEGER,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "playback_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "playback_events_episodeId_createdAt_idx"
  ON "playback_events" ("episodeId", "createdAt");
CREATE INDEX IF NOT EXISTS "playback_events_sourceId_type_createdAt_idx"
  ON "playback_events" ("sourceId", "type", "createdAt");
CREATE INDEX IF NOT EXISTS "playback_events_providerId_type_createdAt_idx"
  ON "playback_events" ("providerId", "type", "createdAt");
CREATE INDEX IF NOT EXISTS "playback_events_type_createdAt_idx"
  ON "playback_events" ("type", "createdAt");

ALTER TABLE "playback_events" DROP CONSTRAINT IF EXISTS "playback_events_userId_fkey";
ALTER TABLE "playback_events" ADD CONSTRAINT "playback_events_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
