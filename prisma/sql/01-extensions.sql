-- Extensions and indexes that Prisma's schema language cannot express.
--
-- Mounted into the Postgres container's init directory (docker-compose.yml), so
-- a fresh database gets them automatically. Apply to an existing database with:
--   psql "$DATABASE_URL" -f prisma/sql/01-extensions.sql

-- Trigram index support: what makes `ILIKE '%term%'` fast enough to serve the
-- search endpoint without a separate search service. See src/server/search.ts.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Accent-insensitive matching, so "amber" finds "Ámbár".
CREATE EXTENSION IF NOT EXISTS unaccent;
