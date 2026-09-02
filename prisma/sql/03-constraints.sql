-- Integrity constraints Prisma's schema language cannot express.
--
--   psql "$DATABASE_URL" -f prisma/sql/03-constraints.sql

-- A comment belongs to exactly one target. The application enforces this too
-- (see commentCreateSchema), but the database is where an invariant survives a
-- bug, a bad migration or a manual UPDATE.
ALTER TABLE comments
  DROP CONSTRAINT IF EXISTS comments_single_target;

ALTER TABLE comments
  ADD CONSTRAINT comments_single_target CHECK (
    (("projectId" IS NOT NULL)::int
   + ("episodeId" IS NOT NULL)::int
   + ("newsPostId" IS NOT NULL)::int) = 1
  );

-- Workflow progress is a percentage, always.
ALTER TABLE episodes
  DROP CONSTRAINT IF EXISTS episodes_progress_range;

ALTER TABLE episodes
  ADD CONSTRAINT episodes_progress_range CHECK (
    "progressTranslation" BETWEEN 0 AND 100 AND
    "progressTiming"      BETWEEN 0 AND 100 AND
    "progressTypesetting" BETWEEN 0 AND 100 AND
    "progressEditing"     BETWEEN 0 AND 100 AND
    "progressEncoding"    BETWEEN 0 AND 100 AND
    "progressQc"          BETWEEN 0 AND 100
  );

-- Megjelenési dátuma csak megjelent epizódnak van.
--
-- A `releases` táblán élő fájlméret-megkötés helyére lép: az a tábla megszűnt.
-- Ez a kettő közti egyetlen lehetséges ellentmondást zárja ki: egy dátum egy
-- olyan epizódon, ami a saját állapota szerint még nem jelent meg. Az ilyen sor
-- bekerülne a hírfolyamba és a kezdőlapra, miközben a projektoldal azt írná
-- róla, hogy készül.
--
-- Nem `now()`-ra vagy bármi másra hivatkozik: a CHECK csak immutábilis
-- kifejezést fogad el, egy „nem lehet a jövőben” megkötést a Postgres
-- visszautasítana.
ALTER TABLE episodes
  DROP CONSTRAINT IF EXISTS episodes_released_requires_status;

ALTER TABLE episodes
  ADD CONSTRAINT episodes_released_requires_status CHECK (
    "releasedAt" IS NULL OR status = 'RELEASED'
  );
