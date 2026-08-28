import 'server-only';
import { env } from '@/lib/env';
import { upstreamFetch, UpstreamError } from '@/lib/anime/http';

/**
 * Jikan (unofficial MyAnimeList API) client.
 *
 * Used for the two things AniList does not give us: the MAL score as MAL states
 * it, and a **per-episode list with titles and air dates**, which is the whole
 * point of the import — a project without episode titles is a list of numbers.
 *
 * Jikan's published limits are 3 requests/second and 60/minute. The 400ms gap
 * sits under the per-second ceiling; the per-minute one is respected by capping
 * how many episode pages a single sync will walk (see `MAX_EPISODE_PAGES`).
 */

const BASE = env.JIKAN_API_URL;
const HOST = 'jikan';
const GAP_MS = 400;

/**
 * Episode pages fetched per sync, at 100 episodes a page.
 *
 * Ten pages covers a thousand episodes, which is every series a fansub is
 * realistically going to work on and still leaves the minute budget intact. A
 * show longer than that (One Piece, Conan) imports its first thousand and says
 * so, rather than spending five minutes of rate limit on one project.
 */
const MAX_EPISODE_PAGES = 10;

export interface JikanAnime {
  mal_id: number;
  url: string | null;
  title: string | null;
  title_english: string | null;
  title_japanese: string | null;
  title_synonyms: string[];
  type: string | null;
  source: string | null;
  episodes: number | null;
  status: string | null;
  airing: boolean;
  duration: string | null;
  rating: string | null;
  score: number | null;
  scored_by: number | null;
  rank: number | null;
  popularity: number | null;
  members: number | null;
  favorites: number | null;
  synopsis: string | null;
  background: string | null;
  season: string | null;
  year: number | null;
  images: { jpg?: { large_image_url?: string | null }; webp?: { large_image_url?: string | null } };
  trailer: { url: string | null; youtube_id: string | null } | null;
  producers: Array<{ mal_id: number; name: string }>;
  licensors: Array<{ mal_id: number; name: string }>;
  studios: Array<{ mal_id: number; name: string }>;
  genres: Array<{ mal_id: number; name: string }>;
  themes: Array<{ mal_id: number; name: string }>;
  demographics: Array<{ mal_id: number; name: string }>;
  aired: { from: string | null; to: string | null } | null;
}

export interface JikanEpisode {
  mal_id: number;
  title: string | null;
  title_japanese: string | null;
  title_romanji: string | null;
  aired: string | null;
  score: number | null;
  filler: boolean;
  recap: boolean;
}

interface JikanEnvelope<T> {
  data: T;
  pagination?: { last_visible_page: number; has_next_page: boolean };
}

/** Full anime record, or `null` when MAL has no such id. */
export async function fetchJikanAnime(malId: number): Promise<JikanAnime | null> {
  try {
    const response = await upstreamFetch<JikanEnvelope<JikanAnime>>({
      host: HOST,
      url: `${BASE}/anime/${malId}/full`,
      gapMs: GAP_MS,
    });
    return response.data ?? null;
  } catch (error) {
    if (error instanceof UpstreamError && error.status === 404) return null;
    throw error;
  }
}

export interface JikanEpisodeList {
  episodes: JikanEpisode[];
  /** True when the show has more episodes than the page cap allowed us to read. */
  truncated: boolean;
}

/**
 * Every episode MAL knows about, paged.
 *
 * Stops at `MAX_EPISODE_PAGES` and reports it rather than walking a
 * thousand-episode series to the end: the caller can then say so in the UI
 * instead of appearing to have imported everything.
 */
export async function fetchJikanEpisodes(malId: number): Promise<JikanEpisodeList> {
  const episodes: JikanEpisode[] = [];
  let page = 1;
  let truncated = false;

  for (;;) {
    const response = await upstreamFetch<JikanEnvelope<JikanEpisode[]>>({
      host: HOST,
      url: `${BASE}/anime/${malId}/episodes?page=${page}`,
      gapMs: GAP_MS,
    });

    episodes.push(...(response.data ?? []));

    if (!response.pagination?.has_next_page) break;
    if (page >= MAX_EPISODE_PAGES) {
      truncated = true;
      break;
    }
    page += 1;
  }

  return { episodes, truncated };
}

/** MAL search, so the admin can find an id without leaving the form. */
export async function searchJikanAnime(
  query: string,
  limit = 10,
): Promise<Array<{ malId: number; title: string; year: number | null; imageUrl: string | null; type: string | null }>> {
  const url = `${BASE}/anime?q=${encodeURIComponent(query)}&limit=${limit}&sfw=true`;
  const response = await upstreamFetch<JikanEnvelope<JikanAnime[]>>({
    host: HOST,
    url,
    gapMs: GAP_MS,
  });

  return (response.data ?? []).map((anime) => ({
    malId: anime.mal_id,
    title: anime.title_english || anime.title || `#${anime.mal_id}`,
    year: anime.year,
    imageUrl: anime.images?.webp?.large_image_url ?? anime.images?.jpg?.large_image_url ?? null,
    type: anime.type,
  }));
}

/**
 * Jikan states duration as prose ("24 min per ep", "1 hr 35 min"). The importer
 * wants minutes, and parsing it here keeps the string-wrangling out of the
 * mapper.
 */
export function parseJikanDuration(duration: string | null | undefined): number | null {
  if (!duration) return null;

  const hours = /(\d+)\s*hr/i.exec(duration);
  const minutes = /(\d+)\s*min/i.exec(duration);
  const total = (Number(hours?.[1] ?? 0) * 60) + Number(minutes?.[1] ?? 0);

  return total > 0 ? total : null;
}
