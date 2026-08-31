-- Két új tábla: hol tart valaki, és mit gondol egy projektről.
--
-- Mindkettőnél a `PRIMARY KEY` az összetett kulcs — nem szurrogát azonosító.
-- Ez nem stílus kérdése: ez az, ami *adatbázis szinten* zárja ki, hogy valaki
-- kétszer pontozzon vagy két különböző pozíciója legyen ugyanahhoz a részhez.
-- Alkalmazáslogikával ugyanez versenyhelyzetben elhasal.

CREATE TABLE "watch_progress" (
    "userId" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "positionSec" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watch_progress_pkey" PRIMARY KEY ("userId","episodeId")
);

-- „Hol tartok" listához: egy felhasználó legutóbb nézett részei.
CREATE INDEX "watch_progress_userId_updatedAt_idx" ON "watch_progress"("userId", "updatedAt");
CREATE INDEX "watch_progress_episodeId_idx" ON "watch_progress"("episodeId");

CREATE TABLE "ratings" (
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("userId","projectId")
);

CREATE INDEX "ratings_projectId_score_idx" ON "ratings"("projectId", "score");

ALTER TABLE "watch_progress" ADD CONSTRAINT "watch_progress_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "watch_progress" ADD CONSTRAINT "watch_progress_episodeId_fkey"
    FOREIGN KEY ("episodeId") REFERENCES "episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A pontszám 1 és 10 közötti. A Prisma sémanyelve nem tud CHECK megszorítást,
-- a validáció pedig csak az egyik belépési pont — ez minden úton áll.
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_score_range" CHECK ("score" BETWEEN 1 AND 10);
-- Negatív lejátszási pozíció nem létezik.
ALTER TABLE "watch_progress" ADD CONSTRAINT "watch_progress_position_positive" CHECK ("positionSec" >= 0);
