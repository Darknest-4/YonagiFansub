import 'server-only';
import { env } from '@/lib/env';
import { upstreamFetch, UpstreamError } from '@/lib/anime/http';

/**
 * AniList GraphQL client.
 *
 * One query, requesting exactly the fields the importer maps. GraphQL makes it
 * tempting to ask for everything and sort it out later; the cost of that is a
 * payload nobody reads and a schema change upstream breaking a field we never
 * used. What is here is what `normalize.ts` consumes, and nothing else.
 *
 * AniList's documented budget is 90 requests per minute (currently served at a
 * reduced rate), which the 700ms gap stays comfortably inside even when a sync
 * run and an admin lookup overlap.
 */

const ENDPOINT = env.ANILIST_API_URL;
const HOST = 'anilist';
const GAP_MS = 700;

const MEDIA_QUERY = /* GraphQL */ `
  query ($id: Int, $malId: Int) {
    Media(id: $id, idMal: $malId, type: ANIME) {
      id
      idMal
      title {
        romaji
        english
        native
      }
      synonyms
      description(asHtml: false)
      format
      status
      episodes
      duration
      season
      seasonYear
      countryOfOrigin
      hashtag
      isAdult
      averageScore
      popularity
      favourites
      source(version: 3)
      startDate {
        year
        month
        day
      }
      endDate {
        year
        month
        day
      }
      coverImage {
        extraLarge
        large
        color
      }
      bannerImage
      trailer {
        id
        site
      }
      genres
      tags {
        name
        rank
        isGeneralSpoiler
        isMediaSpoiler
      }
      studios {
        edges {
          isMain
          node {
            name
          }
        }
      }
      externalLinks {
        site
        url
        type
      }
      relations {
        edges {
          relationType
          node {
            id
            idMal
            type
            title {
              romaji
              english
            }
          }
        }
      }
      nextAiringEpisode {
        episode
        airingAt
      }
    }
  }
`;

export interface AniListDate {
  year: number | null;
  month: number | null;
  day: number | null;
}

export interface AniListMedia {
  id: number;
  idMal: number | null;
  title: { romaji: string | null; english: string | null; native: string | null };
  synonyms: string[];
  description: string | null;
  format: string | null;
  status: string | null;
  episodes: number | null;
  duration: number | null;
  season: string | null;
  seasonYear: number | null;
  countryOfOrigin: string | null;
  hashtag: string | null;
  isAdult: boolean;
  averageScore: number | null;
  popularity: number | null;
  favourites: number | null;
  source: string | null;
  startDate: AniListDate | null;
  endDate: AniListDate | null;
  coverImage: { extraLarge: string | null; large: string | null; color: string | null } | null;
  bannerImage: string | null;
  trailer: { id: string | null; site: string | null } | null;
  genres: string[];
  tags: Array<{
    name: string;
    rank: number | null;
    isGeneralSpoiler: boolean;
    isMediaSpoiler: boolean;
  }>;
  studios: { edges: Array<{ isMain: boolean; node: { name: string } }> };
  externalLinks: Array<{ site: string | null; url: string | null; type: string | null }>;
  relations: {
    edges: Array<{
      relationType: string | null;
      node: {
        id: number;
        idMal: number | null;
        type: string | null;
        title: { romaji: string | null; english: string | null };
      };
    }>;
  };
  nextAiringEpisode: { episode: number; airingAt: number } | null;
}

interface GraphQLResponse<T> {
  data: T | null;
  errors?: Array<{ message: string; status?: number }>;
}

/**
 * Fetches one anime by AniList id or MAL id.
 *
 * Returns `null` for "no such entry" — a missing id is a normal answer to a
 * lookup, not a failure, and making the caller catch an exception for it would
 * put a `try` around every ordinary path.
 */
export async function fetchAniListMedia(params: {
  anilistId?: number | null;
  malId?: number | null;
}): Promise<AniListMedia | null> {
  const { anilistId, malId } = params;
  if (!anilistId && !malId) return null;

  const body = JSON.stringify({
    query: MEDIA_QUERY,
    variables: {
      id: anilistId ?? null,
      // AniList resolves `id` first; sending both would let a mismatched pair
      // silently return the AniList one. Only send `malId` when it is the key.
      malId: anilistId ? null : (malId ?? null),
    },
  });

  try {
    const response = await upstreamFetch<GraphQLResponse<{ Media: AniListMedia | null }>>({
      host: HOST,
      url: ENDPOINT,
      gapMs: GAP_MS,
      init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
    });

    // GraphQL answers a missing record with 200 plus an error entry, so a
    // not-found has to be recognised here rather than from the status code.
    if (response.errors?.length) {
      const notFound = response.errors.some(
        (error) => error.status === 404 || /not found/i.test(error.message),
      );
      if (notFound) return null;
      throw new UpstreamError(response.errors[0]?.message ?? 'AniList hiba.', {
        status: 502,
        host: HOST,
      });
    }

    return response.data?.Media ?? null;
  } catch (error) {
    if (error instanceof UpstreamError && error.status === 404) return null;
    throw error;
  }
}

/** `{ year, month, day }` → a UTC date, or null when the upstream only has part of it. */
export function aniListDate(date: AniListDate | null | undefined): Date | null {
  if (!date?.year || !date.month || !date.day) return null;
  return new Date(Date.UTC(date.year, date.month - 1, date.day));
}

/** AniList embeds a trailer by id and site; only these two are resolvable. */
export function aniListTrailerUrl(
  trailer: { id: string | null; site: string | null } | null | undefined,
): string | null {
  if (!trailer?.id || !trailer.site) return null;
  if (trailer.site === 'youtube') return `https://www.youtube.com/watch?v=${trailer.id}`;
  if (trailer.site === 'dailymotion') return `https://www.dailymotion.com/video/${trailer.id}`;
  return null;
}
