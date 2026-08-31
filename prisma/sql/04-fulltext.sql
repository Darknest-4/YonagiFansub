-- Full-text search (search tier 2).
--
-- Run AFTER `prisma migrate deploy`, and after 01-extensions.sql:
--   npm run db:sql
--
-- ## Why this exists next to the trigram indexes rather than instead of them
--
-- Trigram `ILIKE '%term%'` and full-text search fail in opposite directions.
-- Trigram finds "kaze" inside "Shiokaze" and full-text never will, because a
-- lexeme is a whole word. Full-text finds "nyári fesztiválok" when the post says
-- "nyár" and "fesztivál", ranks a title hit above a synopsis hit, and handles a
-- two-word query as two independent requirements — none of which a substring
-- match can do at all.
--
-- So `search()` runs both and merges. This file adds the second half; nothing
-- here is required for the site to work, and a database that never runs it
-- keeps exactly the search it had.
--
-- ## Why `hungarian` and not a custom configuration
--
-- The obvious design is a configuration that unaccents as part of lexizing.
-- It cannot be indexed: `unaccent()` is STABLE, not IMMUTABLE (a dictionary can
-- be reloaded), which makes `to_tsvector('custom', …)` ineligible for both a
-- generated column and an expression index.
--
-- The documented way around it is a wrapper that pins the dictionary by name and
-- asserts immutability. That is a promise about operational practice — nobody
-- edits unaccent.rules on a running system — rather than something the planner
-- can verify, so it is made once, here, in one small function.
--
-- Hungarian stemming is right for the news posts, which are Hungarian prose.
-- For romaji titles the stemmer occasionally clips a suffix that is not really a
-- suffix, and it does not matter: the same stemmer runs over the query, so both
-- sides clip identically and the match still lands. Consistency is what a search
-- index needs, not linguistic correctness.

CREATE OR REPLACE FUNCTION immutable_unaccent(text)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  STRICT
AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

-- ## Vector builders
--
-- One function per searchable table, used by BOTH the index below and the query
-- in src/server/search.ts. That is the whole point of them: an expression index
-- is only used when the query's expression matches it character for character,
-- and an expression duplicated across a .sql file and a .ts file drifts.
--
-- Changing a body here means dropping and recreating the matching index —
-- Postgres will happily replace the function and leave the index describing the
-- old one.
--
-- Weights are the ranking, and they are ordered by how much a hit there means:
--   A  the title somebody would type
--   B  the other names for the same thing
--   C  attributes worth finding by (studio, source)
--   D  long prose, where a hit is weak evidence

CREATE OR REPLACE FUNCTION project_search_vector(
  title text,
  romaji text,
  english text,
  native text,
  synonyms text[],
  studio text,
  synopsis text
) RETURNS tsvector
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
AS $$
  SELECT
    setweight(to_tsvector('hungarian', immutable_unaccent(coalesce(title, ''))), 'A') ||
    setweight(to_tsvector('hungarian', immutable_unaccent(
      concat_ws(' ', romaji, english, native, array_to_string(coalesce(synonyms, '{}'), ' '))
    )), 'B') ||
    setweight(to_tsvector('hungarian', immutable_unaccent(concat_ws(' ', studio))), 'C') ||
    setweight(to_tsvector('hungarian', immutable_unaccent(coalesce(synopsis, ''))), 'D')
$$;

CREATE OR REPLACE FUNCTION episode_search_vector(
  title text,
  native text,
  synopsis text
) RETURNS tsvector
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
AS $$
  SELECT
    setweight(to_tsvector('hungarian', immutable_unaccent(coalesce(title, ''))), 'A') ||
    setweight(to_tsvector('hungarian', immutable_unaccent(coalesce(native, ''))), 'B') ||
    setweight(to_tsvector('hungarian', immutable_unaccent(coalesce(synopsis, ''))), 'D')
$$;

CREATE OR REPLACE FUNCTION news_search_vector(
  title text,
  excerpt text,
  content text
) RETURNS tsvector
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
AS $$
  SELECT
    setweight(to_tsvector('hungarian', immutable_unaccent(coalesce(title, ''))), 'A') ||
    setweight(to_tsvector('hungarian', immutable_unaccent(coalesce(excerpt, ''))), 'B') ||
    setweight(to_tsvector('hungarian', immutable_unaccent(coalesce(content, ''))), 'D')
$$;

-- ## Indexes
--
-- CONCURRENTLY for the same reason as 02-search-indexes.sql: these run against a
-- live database. Note that a `gin` index on a tsvector expression recomputes the
-- expression on every write to the row — cheap here, since none of these tables
-- take sustained write traffic.

CREATE INDEX CONCURRENTLY IF NOT EXISTS projects_fts_idx
  ON projects USING gin (
    project_search_vector(title, "titleRomaji", "titleEnglish", "titleNative", synonyms, studio, synopsis)
  );

CREATE INDEX CONCURRENTLY IF NOT EXISTS episodes_fts_idx
  ON episodes USING gin (episode_search_vector(title, "titleNative", synopsis));

CREATE INDEX CONCURRENTLY IF NOT EXISTS news_posts_fts_idx
  ON news_posts USING gin (news_search_vector(title, excerpt, content));
