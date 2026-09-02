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

  /*
    Only the key actually being used is sent, and the other is *omitted* rather
    than set to null.

    In GraphQL an explicitly-null argument is not the same thing as an absent
    one, and whether a server reads `idMal: null` as "no filter" or as "idMal
    must be null" is an implementation detail of that server. Depending on it
    means a lookup that works today can start returning nothing after an
    upstream refactor, with no error to point at. Omitting the key removes the
    question.

    Sending both would be wrong for a second reason: AniList resolves `id`
    first, so a mismatched pair would silently return the AniList one.
  */
  const variables: { id?: number; malId?: number } = anilistId
    ? { id: anilistId }
    : { malId: malId as number };

  const body = JSON.stringify({ query: MEDIA_QUERY, variables });

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

/**
 * Why an id came back empty.
 *
 * The main query filters on `type: ANIME`, so a perfectly real id belonging to
 * a manga, novel or one-shot answers exactly like an id that does not exist —
 * and "nem található" then sends somebody off to re-check a number that was
 * right all along. This asks the same id again without the type filter, purely
 * so the failure can say which of the two it was.
 *
 * Only ever called on the failure path, so it costs a request when something is
 * already wrong and nothing at all the rest of the time.
 */
export async function probeAniListId(id: number): Promise<
  { exists: false } | { exists: true; type: string | null; title: string | null }
> {
  const query = /* GraphQL */ `
    query ($id: Int) {
      Media(id: $id) {
        id
        type
        title {
          romaji
          english
        }
      }
    }
  `;

  try {
    const response = await upstreamFetch<
      GraphQLResponse<{
        Media: { id: number; type: string | null; title: { romaji: string | null; english: string | null } } | null;
      }>
    >({
      host: HOST,
      url: ENDPOINT,
      gapMs: GAP_MS,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { id } }),
      },
      // One attempt: this is already the explanation for a failure, and making
      // somebody wait through a retry cycle for a diagnostic is worse than not
      // having one.
      attempts: 1,
    });

    const media = response.data?.Media;
    if (!media) return { exists: false };

    return {
      exists: true,
      type: media.type,
      title: media.title.romaji ?? media.title.english,
    };
  } catch {
    // A probe that cannot run tells us nothing, which is the same as not having
    // asked. The caller falls back to the plain message.
    return { exists: false };
  }
}
