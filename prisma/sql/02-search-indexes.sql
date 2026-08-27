-- Search indexes.
--
-- Run AFTER `prisma migrate deploy` (the tables must exist first):
--   psql "$DATABASE_URL" -f prisma/sql/02-search-indexes.sql
--
-- CONCURRENTLY is deliberate: these run against a live database without taking
-- a write lock. It cannot run inside a transaction block, which is why this is a
-- separate file from the extensions above.

CREATE INDEX CONCURRENTLY IF NOT EXISTS projects_title_trgm_idx
  ON projects USING gin (title gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS projects_title_romaji_trgm_idx
  ON projects USING gin ("titleRomaji" gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS projects_title_english_trgm_idx
  ON projects USING gin ("titleEnglish" gin_trgm_ops);

-- Array containment for the synonyms column (`synonyms @> ARRAY['SnK']`).
CREATE INDEX CONCURRENTLY IF NOT EXISTS projects_synonyms_idx
  ON projects USING gin (synonyms);

CREATE INDEX CONCURRENTLY IF NOT EXISTS episodes_title_trgm_idx
  ON episodes USING gin (title gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS news_posts_title_trgm_idx
  ON news_posts USING gin (title gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS team_members_name_trgm_idx
  ON team_members USING gin (name gin_trgm_ops);

-- Partial index for the busiest query on the site: the public release feed.
-- Only published, non-deleted rows are ever read there, so only those are
-- indexed — a fraction of the size of a full index on releasedAt.
CREATE INDEX CONCURRENTLY IF NOT EXISTS releases_public_feed_idx
  ON releases ("releasedAt" DESC)
  WHERE status = 'PUBLISHED' AND "deletedAt" IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS projects_public_catalogue_idx
  ON projects ("publishedAt" DESC)
  WHERE "publishStatus" = 'PUBLISHED' AND "deletedAt" IS NULL;
