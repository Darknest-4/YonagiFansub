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

-- A file size is never negative.
ALTER TABLE releases
  DROP CONSTRAINT IF EXISTS releases_size_non_negative;

ALTER TABLE releases
  ADD CONSTRAINT releases_size_non_negative CHECK (
    "fileSizeBytes" IS NULL OR "fileSizeBytes" >= 0
  );
