import 'server-only';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { CACHE_TAGS, CACHE_TTL, cached } from '@/lib/cache';

/**
 * The "what came out recently" feed.
 *
 * Replaces the release feed. The release layer was a second record of the same
 * event — an episode being finished — kept in a separate table with its own
 * status, its own date and its own publish flow, and the two drifted apart the
 * first time somebody marked an episode RELEASED without creating a release
 * row. There is one record of it now, on the episode itself.
 *
 * ## Ordered by `releasedAt`, not `updatedAt`
 *
 * The distinction is the whole reason `releasedAt` exists as its own column: a
 * typo fixed in an episode title three months later must not send it back to
 * the top of the feed. `updatedAt` moves on every edit; `releasedAt` is stamped
 * once, when the episode goes out.
 */

export const episodeFeedArgs = Prisma.validator<Prisma.EpisodeDefaultArgs>()({
  select: {
    id: true,
    number: true,
    title: true,
    thumbnailUrl: true,
    durationSec: true,
    releasedAt: true,
    project: {
      select: {
        id: true,
        slug: true,
        title: true,
        titleNative: true,
        coverImageUrl: true,
        accentColor: true,
        type: true,
      },
    },
  },
});

type EpisodeFeedRow = Prisma.EpisodeGetPayload<typeof episodeFeedArgs>;

/**
 * What callers receive.
 *
 * `number` is a `Decimal` in the database, and the data cache serialises it to
 * a **string** on the way back — so a consumer that called `.toNumber()` would
 * work on a cache miss and throw on a hit. Both ends are normalised to a string
 * here, at the one boundary that sees both.
 *
 * `releasedAt` is an ISO string for the same reason: `Date` in, string out.
 */
export interface EpisodeFeedItem {
  id: string;
  number: string;
  title: string | null;
  thumbnailUrl: string | null;
  durationSec: number | null;
  releasedAt: string | null;
  project: {
    id: string;
    slug: string;
    title: string;
    titleNative: string | null;
    coverImageUrl: string | null;
    accentColor: string | null;
    type: EpisodeFeedRow['project']['type'];
  };
}

function toFeedItem(row: EpisodeFeedRow): EpisodeFeedItem {
  return {
    ...row,
    number: row.number.toString(),
    releasedAt: row.releasedAt?.toISOString() ?? null,
  };
}

/** Only what a visitor may see: published project, released episode. */
const publicEpisodeFilter = {
  deletedAt: null,
  status: 'RELEASED',
  releasedAt: { not: null },
  project: { deletedAt: null, publishStatus: 'PUBLISHED' },
} satisfies Prisma.EpisodeWhereInput;

/**
 * The query, uncached.
 *
 * Exported for the same reason the schedule's is: `unstable_cache` only runs
 * inside a Next request context, so a test calling the cached version would
 * exercise the wrapper rather than the filter.
 */
export async function loadLatestEpisodes(limit = 8): Promise<EpisodeFeedItem[]> {
  const rows = await db.episode.findMany({
    where: publicEpisodeFilter,
    ...episodeFeedArgs,
    // The `id` tiebreak keeps the order stable when two episodes share a
    // timestamp — without it, paging or a re-render can repeat or drop a row.
    orderBy: [{ releasedAt: 'desc' }, { id: 'desc' }],
    take: limit,
  });

  return rows.map(toFeedItem);
}

export const getLatestEpisodes = cached(loadLatestEpisodes, ['latest-episodes'], {
  tags: [CACHE_TAGS.projects],
  revalidate: CACHE_TTL.short,
});
