import 'server-only';
import { db } from '@/lib/db';
import { CACHE_TAGS, CACHE_TTL, cached } from '@/lib/cache';

/**
 * The airing schedule.
 *
 * Nothing here is maintained by hand. The page is a view over the catalogue
 * that already exists: a project appears because its status is ONGOING and it
 * is published, and an episode appears because it carries an `airedAt` — both
 * of which the metadata importer fills in and the episode editor keeps current.
 * A schedule somebody has to remember to update is a schedule that is wrong by
 * the second week.
 *
 * ## What the dates actually mean
 *
 * `airedAt` is the **original Japanese broadcast**, as reported by AniList and
 * MyAnimeList. It is not the date our subtitle is ready, and the page says so
 * rather than letting a reader assume otherwise — someone who turns up at that
 * hour will find the Japanese broadcast, subtitled in English at best.
 */

/**
 * How wide a window the calendar covers.
 *
 * Defaults only. The real numbers come from the `schedulePastDays` and
 * `scheduleFutureDays` settings and are passed in by the page — a week back
 * covers "did I miss one?", and three weeks forward is about as far as upstream
 * broadcast dates stay reliable, but a group running a long-dormant catalogue
 * may reasonably want either end wider.
 *
 * They are arguments rather than a settings read inside the loader because the
 * loader is cached: `unstable_cache` builds its key from the arguments, so a
 * changed window gets its own entry instead of being served the old one until
 * the TTL expires.
 */
export const SCHEDULE_WINDOW_DEFAULT = { pastDays: 7, futureDays: 21 } as const;

export interface ScheduleWindow {
  pastDays: number;
  futureDays: number;
}

export interface ScheduledEpisode {
  episodeId: string;
  number: number;
  title: string | null;
  /**
   * ISO string, not a `Date`, and that is not a style choice.
   *
   * `unstable_cache` serialises through JSON, so a `Date` put in comes back out
   * as a string — and a type that claims otherwise turns into
   * `RangeError: Invalid time value` at render time, on the cached path only.
   * Tests that call the loader directly never see it, because there the `Date`
   * survives. Typing it as what actually crosses the boundary is what stops the
   * type from lying.
   */
  airedAt: string;
  status: 'RELEASED' | 'PLANNED' | 'IN_PROGRESS' | 'QC' | 'CANCELLED';
  /**
   * True once our own subtitle is out — the difference between "aired" and
   * "done".
   *
   * Read straight off the episode's status. It used to count published releases
   * hanging off the episode, which was a second record of the same fact and
   * therefore a second chance to be wrong: an episode marked RELEASED with no
   * release row read as unsubtitled, and a stray draft row read the other way.
   * One field, one answer.
   */
  subtitled: boolean;
  project: {
    id: string;
    slug: string;
    title: string;
    titleNative: string | null;
    coverImageUrl: string | null;
    accentColor: string | null;
  };
}

export interface ScheduleDay {
  /** `YYYY-MM-DD` in Europe/Budapest, which is the day a Hungarian reader means. */
  date: string;
  episodes: ScheduledEpisode[];
}

/**
 * Groups by local calendar day.
 *
 * Deliberately in Budapest time rather than UTC: a Japanese broadcast at 01:30
 * JST on Saturday is Friday evening here, and a calendar that files it under
 * Saturday is telling a Hungarian reader the wrong day.
 */
function localDay(date: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Budapest' }).format(date);
}

/**
 * The query itself, uncached.
 *
 * Exported because `unstable_cache` only runs inside a Next request context —
 * a test that called the cached version would fail on the wrapper rather than
 * exercise the filter, which is the part worth pinning.
 */
export async function loadSchedule(
  window: ScheduleWindow = SCHEDULE_WINDOW_DEFAULT,
): Promise<ScheduleDay[]> {
  const now = new Date();
  const from = new Date(now.getTime() - window.pastDays * 86_400_000);
  const to = new Date(now.getTime() + window.futureDays * 86_400_000);

  const episodes = await db.episode.findMany({
    where: {
      deletedAt: null,
      airedAt: { gte: from, lte: to },
      status: { not: 'CANCELLED' },
      // The whole filter, in one place: only what the team is actually running.
      project: {
        deletedAt: null,
        publishStatus: 'PUBLISHED',
        status: 'ONGOING',
      },
    },
    orderBy: [{ airedAt: 'asc' }, { number: 'asc' }],
    select: {
      id: true,
      number: true,
      title: true,
      airedAt: true,
      status: true,
      project: {
        select: {
          id: true,
          slug: true,
          title: true,
          titleNative: true,
          coverImageUrl: true,
          accentColor: true,
        },
      },
    },
  });

  const days = new Map<string, ScheduledEpisode[]>();

  for (const episode of episodes) {
    // Narrowed by the query, but the column is nullable so the compiler cannot
    // know that.
    if (!episode.airedAt) continue;

    const key = localDay(episode.airedAt);
    const entry: ScheduledEpisode = {
      episodeId: episode.id,
      number: Number(episode.number),
      title: episode.title,
      airedAt: episode.airedAt.toISOString(),
      status: episode.status,
      subtitled: episode.status === 'RELEASED',
      project: episode.project,
    };

    days.set(key, [...(days.get(key) ?? []), entry]);
  }

  return [...days.entries()]
    .map(([date, list]) => ({ date, episodes: list }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Cached like the rest of the catalogue.
 *
 * Short TTL rather than a long one: the difference the page exists to show —
 * "our subtitle is out now" — flips the moment a release is published, and an
 * hour of staleness on that is the one thing a reader would notice.
 */
export const getSchedule = cached(loadSchedule, ['schedule'], {
  tags: [CACHE_TAGS.projects],
  revalidate: CACHE_TTL.short,
});

/**
 * Running projects whose next episode has no date upstream.
 *
 * Without this they would simply vanish from a page that claims to list what is
 * running. "We are working on it, the broadcaster has not announced a date" is
 * information; an empty space is not.
 *
 * Uncached, for the same reason as `loadSchedule`.
 */
export async function loadUndatedOngoing() {
  const now = new Date();

  return db.project.findMany({
    where: {
      deletedAt: null,
      publishStatus: 'PUBLISHED',
      status: 'ONGOING',
      // Nothing dated ahead of us — the project is running but unscheduled.
      episodes: { none: { deletedAt: null, airedAt: { gte: now } } },
    },
    orderBy: { title: 'asc' },
    select: {
      id: true,
      slug: true,
      title: true,
      titleNative: true,
      coverImageUrl: true,
      accentColor: true,
    },
  });
}

export const getUndatedOngoing = cached(loadUndatedOngoing, ['schedule-undated'], {
  tags: [CACHE_TAGS.projects],
  revalidate: CACHE_TTL.medium,
});
