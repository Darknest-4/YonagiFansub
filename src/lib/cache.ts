import 'server-only';
import { unstable_cache, revalidateTag } from 'next/cache';
import { logger } from '@/lib/logger';

/**
 * Caching strategy.
 *
 * Read-heavy public data (project catalogue, release feed, news, team, settings)
 * is cached in Next's data cache and invalidated by *tag* whenever the admin
 * panel writes. That gives near-static response times with immediate freshness
 * after an edit — no TTL guessing, no stale release list after a publish.
 *
 * Tags are centralised here so a mutation can never invalidate a tag that does
 * not exist (a typo would silently serve stale data forever).
 */

export const CACHE_TAGS = {
  projects: 'projects',
  project: (slug: string) => `project:${slug}`,
  episodes: (projectId: string) => `episodes:${projectId}`,
  news: 'news',
  newsPost: (slug: string) => `news:${slug}`,
  team: 'team',
  teamMember: (slug: string) => `team:${slug}`,
  genres: 'genres',
  faq: 'faq',
  settings: 'settings',
  stats: 'stats',
} as const;

/**
 * Cache payload version. **Bump this whenever a cached loader's shape changes.**
 *
 * Every key built by `cached()` carries this prefix, so bumping it makes the
 * whole data cache unreadable in one step rather than one loader at a time.
 *
 * This is not housekeeping — it is a correctness fix for a bug that reached a
 * production build here: a `select` gained fields, the cache still held an entry
 * written before that, and the new render read `project.tags.length` off a value
 * that no longer had `tags`. The page 500'd, and the types said it could not,
 * because a cache entry is the one place where TypeScript's guarantee does not
 * reach: it was serialised by different code than the code reading it back.
 *
 * The failure is also the nastiest kind to catch — invisible on a cold cache, so
 * it passes locally and in CI, then fires on the first deploy that restores a
 * warm one. A stale entry cannot be read by newer code if the key never matches.
 */
export const CACHE_VERSION = 'v2';

export const CACHE_TTL = {
  /** Content that changes on a human timescale. */
  short: 60,
  medium: 300,
  long: 3600,
  day: 86_400,
} as const;

/**
 * Wraps a loader in the data cache.
 *
 * `keyParts` must include every argument that changes the result — Next does not
 * inspect the closure, so a forgotten argument produces cross-contaminated
 * cache entries. Callers pass their filter object serialised for that reason.
 *
 * The signature is a single type parameter over the whole function type, not the
 * more obvious `(...args: TArgs) => Promise<TResult>`. That form infers `unknown`
 * for parameters that have defaults, and it collapses Prisma's precise payload
 * types on the way out — which turns a typo in a `select` into a runtime bug
 * instead of a compile error. Capturing `T` whole preserves both ends exactly.
 *
 * ## The one thing the types lie about
 *
 * The data cache round-trips through JSON, so what comes *out* is not always
 * what the loader put in, even though `T` says it is:
 *
 * - `Date` → ISO **string**. `value.toISOString()` throws on a cache hit and
 *   works on a miss, which is why it survives development and fails in
 *   production. Read dates through `toIsoString()` / `formatDate()` in
 *   `lib/utils.ts`; both accept either shape.
 * - `BigInt` → `TypeError` at write time (`JSON.stringify` refuses it). Convert
 *   at the service boundary — `Release.fileSizeBytes` is handed out as a
 *   decimal string for exactly this reason.
 * - `Decimal` → string. Already handled by `formatEpisodeNumber()`.
 *
 * Anything cached must therefore be plain-JSON-safe, and anything read back
 * must tolerate the serialised shape.
 *
 * Keys are prefixed with `CACHE_VERSION`, which is what keeps an entry written
 * by an older deploy from being handed to code that expects a wider shape. See
 * the note on that constant before changing what a cached loader returns.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see the note above.
export function cached<T extends (...args: any[]) => Promise<unknown>>(
  loader: T,
  keyParts: string[],
  options: { tags: string[]; revalidate?: number },
): T {
  // The prefix is added here rather than at the call sites: twenty-one callers
  // is twenty-one chances to forget, and forgetting is a 500 on a warm cache.
  return unstable_cache(loader, [CACHE_VERSION, ...keyParts], {
    tags: options.tags,
    revalidate: options.revalidate ?? CACHE_TTL.medium,
  }) as T;
}

/** Invalidate one or more tags after a mutation. Safe to call with duplicates. */
export function invalidate(...tags: string[]): void {
  for (const tag of new Set(tags)) {
    try {
      revalidateTag(tag);
    } catch (error) {
      // `revalidateTag` throws when called outside a request scope (e.g. from a
      // background job). That is not fatal: the TTL will catch up.
      logger.warn('Cache invalidation skipped', { tag, error: String(error) });
    }
  }
}

/** Convenience bundles for the common mutation shapes. */
export const invalidateProject = (slug: string) =>
  invalidate(CACHE_TAGS.projects, CACHE_TAGS.project(slug), CACHE_TAGS.stats);

export const invalidateNews = (slug?: string) =>
  invalidate(CACHE_TAGS.news, ...(slug ? [CACHE_TAGS.newsPost(slug)] : []));

export const invalidateTeam = (slug?: string) =>
  invalidate(CACHE_TAGS.team, ...(slug ? [CACHE_TAGS.teamMember(slug)] : []));

/**
 * Tiny per-request memo for values read many times while rendering one page
 * (site settings, navigation). React's `cache()` covers server components;
 * this covers plain server modules called from both RSC and route handlers.
 */
export function memoizeWithTtl<TResult>(loader: () => Promise<TResult>, ttlMs: number) {
  let value: { data: TResult; expiresAt: number } | null = null;
  let inFlight: Promise<TResult> | null = null;

  return async (): Promise<TResult> => {
    const now = Date.now();
    if (value && value.expiresAt > now) return value.data;
    // Collapse concurrent misses into a single upstream call.
    inFlight ??= loader()
      .then((data) => {
        value = { data, expiresAt: Date.now() + ttlMs };
        return data;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };
}
