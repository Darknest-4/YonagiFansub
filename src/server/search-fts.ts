import 'server-only';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * Search tier 2 — Postgres full-text, ranked.
 *
 * This is an *addition* to the trigram matching in `search.ts`, not a
 * replacement, because the two fail in opposite directions:
 *
 *   • Trigram finds "kaze" inside "Shiokaze". Full-text never will — a lexeme is
 *     a whole word.
 *   • Full-text finds a post about "nyári fesztiválok" when somebody types
 *     "fesztivál", ranks a title hit above a synopsis hit, and treats a two-word
 *     query as two requirements. Substring matching does none of that.
 *
 * So `search()` runs both and merges by id. Nothing here can make search worse:
 * a database that never ran `prisma/sql/04-fulltext.sql` simply gets the tier-1
 * results it always got, and finds that out once rather than on every query.
 *
 * The index expressions live in that same SQL file, in functions this module
 * calls by name so the two cannot drift.
 */

export interface FtsHit {
  id: string;
  /** `ts_rank_cd`, roughly 0–1. Mapped onto the caller's own scale. */
  rank: number;
}

/**
 * Turns what somebody typed into a `tsquery` string.
 *
 * Every character that is not a letter or a digit is dropped rather than
 * escaped. That is what makes interpolating the result safe — `&`, `|`, `!`,
 * `(`, `)`, `:` and `*` are the entire tsquery operator set, and none of them
 * can survive — and it is also the right behaviour for a search box: somebody
 * typing `Re:Zero` means the words, not an operator.
 *
 * The last term gets `:*` so that search-as-you-type works. Only the last one:
 * a prefix match on every word makes "a" match everything, and the earlier words
 * in a query are the ones somebody has finished typing.
 *
 * Returns null when nothing usable is left, which is the signal to skip the
 * full-text pass entirely rather than send Postgres an empty query.
 */
export function toTsQuery(term: string): string | null {
  const words = term
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0);

  if (words.length === 0) return null;

  return words
    .map((word, index) => (index === words.length - 1 ? `${word}:*` : word))
    .join(' & ');
}

/**
 * Whether the tier-2 objects exist in this database.
 *
 * Probed once and remembered. The alternative — letting the query fail and
 * catching it — would turn a missing deployment step into a silent per-request
 * error, and would swallow a genuine bug in the SQL along with it.
 *
 * A promise rather than a boolean so that concurrent first requests share one
 * probe instead of racing three of them.
 */
let capability: Promise<boolean> | null = null;

export function isFullTextAvailable(): Promise<boolean> {
  capability ??= probe();
  return capability;
}

async function probe(): Promise<boolean> {
  try {
    // `to_regprocedure`, not `to_regproc`: the latter takes a bare name and
    // returns null for anything with an argument list, which would report a
    // fully installed database as missing.
    const rows = await db.$queryRaw<Array<{ ok: boolean }>>`
      SELECT to_regprocedure('project_search_vector(text,text,text,text,text[],text,text)') IS NOT NULL
         AND to_regprocedure('episode_search_vector(text,text,text)') IS NOT NULL
         AND to_regprocedure('news_search_vector(text,text,text)') IS NOT NULL AS ok
    `;

    const ok = rows[0]?.ok === true;
    if (!ok) {
      logger.info('A teljes szövegű keresés nincs telepítve — `npm run db:sql` bekapcsolja.', {
        tier: 1,
      });
    }
    return ok;
  } catch (error) {
    // A probe that cannot run is not a reason to fail a search.
    logger.warn('A keresési képesség vizsgálata nem sikerült.', { error: String(error) });
    return false;
  }
}

/** Test seam: forget the probe so the next call re-runs it. */
export function resetFullTextProbe(): void {
  capability = null;
}

/**
 * The three full-text passes, in one round trip each.
 *
 * `ts_rank_cd` rather than `ts_rank`: cover density counts how close the matched
 * lexemes are to each other, which is what makes a two-word query rank the row
 * where those words appear together above the row that merely contains both.
 *
 * The visibility filters are duplicated from tier 1 on purpose. They are the
 * difference between a draft leaking into search results and not, so they belong
 * in the query rather than in a shared helper that a future refactor could
 * quietly drop from one of the two paths.
 */
export async function fullTextSearch(
  term: string,
  limit: number,
  wants: (type: 'project' | 'episode' | 'news') => boolean,
): Promise<{ projects: FtsHit[]; episodes: FtsHit[]; news: FtsHit[] }> {
  const empty = { projects: [], episodes: [], news: [] };

  const query = toTsQuery(term);
  if (!query || !(await isFullTextAvailable())) return empty;

  const q = Prisma.sql`to_tsquery('hungarian', ${query})`;
  const take = limit * 2;

  const [projects, episodes, news] = await Promise.all([
    wants('project')
      ? db.$queryRaw<FtsHit[]>`
          SELECT p.id,
                 ts_rank_cd(
                   project_search_vector(p.title, p."titleRomaji", p."titleEnglish",
                                         p."titleNative", p.synonyms, p.studio, p.synopsis),
                   ${q}
                 ) AS rank
          FROM projects p
          WHERE p."deletedAt" IS NULL
            AND p."publishStatus" = 'PUBLISHED'
            AND project_search_vector(p.title, p."titleRomaji", p."titleEnglish",
                                      p."titleNative", p.synonyms, p.studio, p.synopsis) @@ ${q}
          ORDER BY rank DESC
          LIMIT ${take}
        `
      : [],

    wants('episode')
      ? db.$queryRaw<FtsHit[]>`
          SELECT e.id,
                 ts_rank_cd(episode_search_vector(e.title, e."titleNative", e.synopsis), ${q}) AS rank
          FROM episodes e
          JOIN projects p ON p.id = e."projectId"
          WHERE e."deletedAt" IS NULL
            AND p."deletedAt" IS NULL
            AND p."publishStatus" = 'PUBLISHED'
            AND episode_search_vector(e.title, e."titleNative", e.synopsis) @@ ${q}
          ORDER BY rank DESC
          LIMIT ${take}
        `
      : [],

    wants('news')
      ? db.$queryRaw<FtsHit[]>`
          SELECT n.id,
                 ts_rank_cd(news_search_vector(n.title, n.excerpt, n.content), ${q}) AS rank
          FROM news_posts n
          WHERE n."deletedAt" IS NULL
            AND n.status = 'PUBLISHED'
            AND n."publishedAt" <= now()
            AND news_search_vector(n.title, n.excerpt, n.content) @@ ${q}
          ORDER BY rank DESC
          LIMIT ${take}
        `
      : [],
  ]);

  return { projects, episodes, news };
}
