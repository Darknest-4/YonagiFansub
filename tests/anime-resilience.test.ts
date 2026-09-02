import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Surviving one upstream being down.
 *
 * This is not hypothetical: AniList sits behind Cloudflare and refuses requests
 * from some hosting providers while Jikan answers the same server fine. The
 * first version treated that as fatal, so an import that could have succeeded
 * from MyAnimeList alone returned nothing — a hard failure with a usable result
 * sitting right there.
 *
 * The modules are mocked at the client boundary rather than over `fetch`,
 * because what is under test is the merge policy, not HTTP.
 */

const anilistMock = vi.fn();
const jikanMock = vi.fn();
const episodesMock = vi.fn();

vi.mock('@/lib/anime/anilist', async () => {
  const actual = await vi.importActual<typeof import('@/lib/anime/anilist')>(
    '@/lib/anime/anilist',
  );
  return { ...actual, fetchAniListMedia: anilistMock };
});

vi.mock('@/lib/anime/jikan', async () => {
  const actual = await vi.importActual<typeof import('@/lib/anime/jikan')>('@/lib/anime/jikan');
  return { ...actual, fetchJikanAnime: jikanMock, fetchJikanEpisodes: episodesMock };
});

vi.mock('@/lib/db', () => ({ db: {} }));

const { lookupAnime } = await import('@/server/admin/metadata-sync');
const { UpstreamError } = await import('@/lib/anime/http');

const JIKAN_ANIME = {
  mal_id: 9253,
  url: null,
  title: 'Steins;Gate',
  title_english: 'Steins;Gate',
  title_japanese: 'STEINS;GATE',
  title_synonyms: [],
  type: 'TV',
  source: 'Visual novel',
  episodes: 24,
  status: 'Finished Airing',
  airing: false,
  duration: '24 min per ep',
  rating: 'PG-13 - Teens 13 or older',
  score: 9.07,
  scored_by: 1,
  rank: 3,
  popularity: 13,
  members: 100,
  favorites: 50,
  synopsis: 'Szinopszis.',
  background: null,
  season: 'spring',
  year: 2011,
  images: { jpg: { large_image_url: 'https://cdn.myanimelist.net/sg.jpg' } },
  trailer: null,
  producers: [],
  licensors: [],
  studios: [{ mal_id: 1, name: 'White Fox' }],
  genres: [{ mal_id: 8, name: 'Drama' }],
  themes: [],
  demographics: [],
  aired: { from: '2011-04-06T00:00:00+00:00', to: null },
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('lookupAnime resilience', () => {
  it('still imports from MyAnimeList when AniList refuses the request', async () => {
    // Exactly the reported situation: Jikan fine, AniList 403.
    anilistMock.mockRejectedValue(
      new UpstreamError('anilist válasza: HTTP 403', { status: 403, host: 'anilist' }),
    );
    jikanMock.mockResolvedValue(JIKAN_ANIME);
    episodesMock.mockResolvedValue({ episodes: [], truncated: false });

    const result = await lookupAnime({ malId: 9253 });

    expect(result.displayTitle).toBe('Steins;Gate');
    expect(result.malScore).toBe(9.07);
    expect(result.sources).toEqual(['jikan']);
    // The gap is reported, not hidden: a partial result presented as complete
    // is worse than a failure.
    expect(result.warnings.join(' ')).toContain('AniList');
    expect(result.warnings.join(' ')).toContain('403');
  });

  it('still imports from AniList when MyAnimeList is down', async () => {
    anilistMock.mockResolvedValue({
      id: 9253,
      idMal: 9253,
      title: { romaji: 'Steins;Gate', english: null, native: null },
      synonyms: [],
      description: null,
      format: 'TV',
      status: 'FINISHED',
      episodes: 24,
      duration: 24,
      season: 'SPRING',
      seasonYear: 2011,
      countryOfOrigin: 'JP',
      hashtag: null,
      isAdult: false,
      averageScore: 88,
      popularity: 1,
      favourites: 1,
      source: 'VISUAL_NOVEL',
      startDate: null,
      endDate: null,
      coverImage: null,
      bannerImage: null,
      trailer: null,
      genres: [],
      tags: [],
      studios: { edges: [] },
      externalLinks: [],
      relations: { edges: [] },
      nextAiringEpisode: null,
    });
    jikanMock.mockRejectedValue(
      new UpstreamError('jikan válasza: HTTP 503', { status: 503, host: 'jikan' }),
    );
    episodesMock.mockResolvedValue({ episodes: [], truncated: false });

    const result = await lookupAnime({ anilistId: 9253 });

    expect(result.sources).toEqual(['anilist']);
    expect(result.averageScore).toBe(88);
    expect(result.warnings.join(' ')).toContain('MyAnimeList');
  });

  it('keeps the metadata when only the episode list fails', async () => {
    // Episode titles are a bonus; losing them must not undo the whole import.
    anilistMock.mockResolvedValue(null);
    jikanMock.mockResolvedValue(JIKAN_ANIME);
    episodesMock.mockRejectedValue(
      new UpstreamError('jikan válasza: HTTP 500', { status: 500, host: 'jikan' }),
    );

    const result = await lookupAnime({ malId: 9253 });

    expect(result.displayTitle).toBe('Steins;Gate');
    expect(result.episodes).toEqual([]);
  });

  it('fails loudly only when both sources are unreachable', async () => {
    anilistMock.mockRejectedValue(
      new UpstreamError('anilist válasza: HTTP 403', { status: 403, host: 'anilist' }),
    );
    jikanMock.mockRejectedValue(
      new UpstreamError('jikan válasza: HTTP 503', { status: 503, host: 'jikan' }),
    );

    await expect(lookupAnime({ malId: 9253 })).rejects.toThrow(/nem elérhet/i);
  });

  it('reports a missing id as a bad id rather than as an outage', async () => {
    // Nothing failed — the id simply does not exist. Different problem, and the
    // person typing the id needs to be told which one it is.
    anilistMock.mockResolvedValue(null);
    jikanMock.mockResolvedValue(null);

    // Asserted on the distinction, not on the wording: the message names the id
    // and where to check it, and must not blame the upstream for being down.
    const failure = lookupAnime({ malId: 999_999_999 });

    await expect(failure).rejects.toThrow(/999999999/);
    await expect(failure).rejects.toThrow(/myanimelist\.net/i);
    await expect(failure).rejects.not.toThrow(/nem elérhet/i);
  });
});
