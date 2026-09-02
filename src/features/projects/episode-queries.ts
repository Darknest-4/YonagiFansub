import 'server-only';
import { Prisma } from '@prisma/client';
import { cache as reactCache } from 'react';
import { db } from '@/infrastructure/db';
import { CACHE_TAGS, CACHE_TTL, cached } from '@/infrastructure/cache';
import { publicProjectFilter } from '@/features/projects/queries';

/**
 * Az epizódok olvasási oldala.
 *
 * Külön fájl a projektlekérdezésektől, de ugyanaz a feature: a lista mindig egy
 * projekthez tartozik, a részletek pedig a projekt slugja alapján találhatók
 * meg. Aki epizódot keres, ide néz; aki katalógust, a `queries.ts`-be.
 */

export const episodeListArgs = Prisma.validator<Prisma.EpisodeDefaultArgs>()({
  select: {
    id: true,
    number: true,
    title: true,
    titleNative: true,
    synopsis: true,
    thumbnailUrl: true,
    durationSec: true,
    airedAt: true,
    status: true,
    progressTranslation: true,
    progressTiming: true,
    progressTypesetting: true,
    progressEditing: true,
    progressEncoding: true,
    progressQc: true,
    updatedAt: true,
    releasedAt: true,
    /*
      Whether anything is actually playable.

      This used to be the list of published releases hanging off the episode.
      With the release layer gone, what a reader wants to know is the same
      question in the terms that are left: is there a source, and does it need
      an account. The count is enough for the list; the sources themselves are
      loaded on the episode page, which is the only place they are played.
    */
    _count: { select: { videos: { where: { status: 'PUBLISHED', deletedAt: null } } } },
  },
});

export type EpisodeListItem = Prisma.EpisodeGetPayload<typeof episodeListArgs>;

export async function listEpisodes(
  projectId: string,
  includeUnreleased = true,
): Promise<EpisodeListItem[]> {
  const rows = await db.episode.findMany({
    where: {
      projectId,
      deletedAt: null,
      ...(includeUnreleased ? {} : { status: 'RELEASED' }),
    },
    ...episodeListArgs,
    orderBy: { number: 'asc' },
  });

  return rows;
}

export const getPublicEpisodes = cached(
  async (projectId: string) => listEpisodes(projectId, true),
  ['public-episodes'],
  { tags: [CACHE_TAGS.projects], revalidate: CACHE_TTL.short },
);

/** Full episode payload for the episode page. */
export const episodeDetailArgs = Prisma.validator<Prisma.EpisodeDefaultArgs>()({
  select: {
    id: true,
    number: true,
    title: true,
    titleNative: true,
    synopsis: true,
    thumbnailUrl: true,
    durationSec: true,
    airedAt: true,
    status: true,
    progressTranslation: true,
    progressTiming: true,
    progressTypesetting: true,
    progressEditing: true,
    progressEncoding: true,
    progressQc: true,
    updatedAt: true,
    project: {
      select: {
        id: true,
        slug: true,
        title: true,
        titleNative: true,
        coverImageUrl: true,
        bannerImageUrl: true,
        accentColor: true,
        totalEpisodes: true,
      },
    },
    releasedAt: true,
  },
});

export type EpisodeDetail = Prisma.EpisodeGetPayload<typeof episodeDetailArgs>;

/**
 * One episode, memoised for the duration of the request.
 *
 * React's `cache()` rather than the data cache: the row is not worth holding
 * between requests (it changes the moment the team edits it), but it *is*
 * fetched more than once inside a single render — `generateMetadata`, the
 * segment layout that answers 404, and the page body all need it. Without this
 * that is three identical queries per page view.
 */
export const getEpisode = reactCache(async (projectSlug: string, episodeNumber: number) => {
  return db.episode.findFirst({
    where: {
      deletedAt: null,
      number: episodeNumber,
      project: { slug: projectSlug, ...publicProjectFilter },
    },
    ...episodeDetailArgs,
  });
});

/** Adjacent episodes, for the prev/next navigation on the episode page. */
export async function getEpisodeNeighbours(projectId: string, number: number) {
  const [previous, next] = await Promise.all([
    db.episode.findFirst({
      where: { projectId, deletedAt: null, number: { lt: number } },
      orderBy: { number: 'desc' },
      select: { number: true, title: true },
    }),
    db.episode.findFirst({
      where: { projectId, deletedAt: null, number: { gt: number } },
      orderBy: { number: 'asc' },
      select: { number: true, title: true },
    }),
  ]);
  return { previous, next };
}
