import { describe, expect, it } from 'vitest';
import { normalizeAnime } from '@/features/metadata/normalize';
import { parseJikanDuration } from '@/features/metadata/jikan';
import { aniListDate, aniListTrailerUrl } from '@/features/metadata/anilist';
import type { AniListMedia } from '@/features/metadata/anilist';
import type { JikanAnime, JikanEpisode } from '@/features/metadata/jikan';

/**
 * Merging two upstream metadata sources.
 *
 * The merge decides which source wins per field, and getting that wrong is
 * invisible until a project page shows a MAL score AniList invented or an
 * episode list with no titles. These pin the rules stated in `normalize.ts`.
 *
 * Fixtures are trimmed to the fields under test; the mapper reads what it reads
 * and a fuller fixture would only make the expectations harder to see.
 */

function media(overrides: Partial<AniListMedia> = {}): AniListMedia {
  return {
    id: 9253,
    idMal: 9253,
    title: { romaji: 'Steins;Gate', english: 'Steins Gate', native: 'STEINS;GATE' },
    synonyms: ['シュタゲ'],
    description: 'Egy <i>mondat</i>.<br>Második sor.',
    format: 'TV',
    status: 'FINISHED',
    episodes: 24,
    duration: 24,
    season: 'SPRING',
    seasonYear: 2011,
    countryOfOrigin: 'JP',
    hashtag: '#シュタゲ',
    isAdult: false,
    averageScore: 88,
    popularity: 500,
    favourites: 400,
    source: 'VISUAL_NOVEL',
    startDate: { year: 2011, month: 4, day: 6 },
    endDate: { year: 2011, month: 9, day: 14 },
    coverImage: { extraLarge: 'https://a/xl.jpg', large: 'https://a/l.jpg', color: '#e4a15d' },
    bannerImage: 'https://a/banner.jpg',
    trailer: { id: 'abc123', site: 'youtube' },
    genres: ['Drama', 'Sci-Fi'],
    tags: [
      { name: 'Time Manipulation', rank: 95, isGeneralSpoiler: false, isMediaSpoiler: false },
      { name: 'Tragedy', rank: 99, isGeneralSpoiler: true, isMediaSpoiler: false },
      { name: 'Twist', rank: 98, isGeneralSpoiler: false, isMediaSpoiler: true },
    ],
    studios: {
      edges: [
        { isMain: false, node: { name: 'Frontier Works' } },
        { isMain: true, node: { name: 'White Fox' } },
      ],
    },
    externalLinks: [
      { site: 'Official Site', url: 'https://sg.tv', type: 'INFO' },
      { site: 'Broken', url: null, type: null },
    ],
    relations: {
      edges: [
        {
          relationType: 'SEQUEL',
          node: { id: 21127, idMal: 30484, type: 'ANIME', title: { romaji: 'S;G 0', english: null } },
        },
        {
          relationType: 'ADAPTATION',
          node: { id: 999, idMal: null, type: 'MANGA', title: { romaji: 'Manga', english: null } },
        },
      ],
    },
    nextAiringEpisode: null,
    ...overrides,
  };
}

function jikan(overrides: Partial<JikanAnime> = {}): JikanAnime {
  return {
    mal_id: 9253,
    url: null,
    title: 'Steins;Gate',
    title_english: 'Steins;Gate',
    title_japanese: 'STEINS;GATE',
    title_synonyms: ['Steins Gate'],
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
    members: 2_400_000,
    favorites: 190_000,
    synopsis: 'MAL szinopszis.',
    background: null,
    season: 'spring',
    year: 2011,
    images: { jpg: { large_image_url: 'https://mal/l.jpg' } },
    trailer: null,
    producers: [{ mal_id: 1, name: 'Media Factory' }],
    licensors: [{ mal_id: 2, name: 'Funimation' }],
    studios: [{ mal_id: 3, name: 'White Fox' }],
    genres: [{ mal_id: 4, name: 'Suspense' }],
    themes: [{ mal_id: 5, name: 'Psychological' }],
    demographics: [],
    aired: { from: '2011-04-06T00:00:00+00:00', to: '2011-09-14T00:00:00+00:00' },
    ...overrides,
  };
}

const episode = (overrides: Partial<JikanEpisode> = {}): JikanEpisode => ({
  mal_id: 1,
  title: 'Turning Point',
  title_japanese: '第1話',
  title_romanji: 'Tenkan Ten',
  aired: '2011-04-06T00:00:00+00:00',
  score: 4.5,
  filler: false,
  recap: false,
  ...overrides,
});

describe('normalizeAnime – source precedence', () => {
  it('takes the MAL score from Jikan and the average from AniList', () => {
    const result = normalizeAnime({ anilist: media(), jikan: jikan(), episodes: [] });

    // The MAL score is by definition MAL's; AniList's is its own number.
    expect(result.malScore).toBe(9.07);
    expect(result.averageScore).toBe(88);
  });

  it('prefers AniList structured fields and falls back to Jikan', () => {
    const result = normalizeAnime({ anilist: media(), jikan: jikan(), episodes: [] });
    expect(result.startDate?.toISOString().slice(0, 10)).toBe('2011-04-06');
    expect(result.durationMin).toBe(24);
    expect(result.coverImageUrl).toBe('https://a/xl.jpg');

    const jikanOnly = normalizeAnime({ anilist: null, jikan: jikan(), episodes: [] });
    expect(jikanOnly.startDate?.toISOString().slice(0, 10)).toBe('2011-04-06');
    expect(jikanOnly.durationMin).toBe(24);
    expect(jikanOnly.coverImageUrl).toBe('https://mal/l.jpg');
  });

  it('works from either source alone', () => {
    expect(normalizeAnime({ anilist: media(), jikan: null, episodes: [] }).sources).toEqual([
      'anilist',
    ]);
    expect(normalizeAnime({ anilist: null, jikan: jikan(), episodes: [] }).sources).toEqual([
      'jikan',
    ]);
  });

  it('takes producers and licensors from Jikan, which AniList does not model', () => {
    const result = normalizeAnime({ anilist: media(), jikan: jikan(), episodes: [] });
    expect(result.producers).toEqual(['Media Factory']);
    expect(result.licensors).toEqual(['Funimation']);
  });
});

describe('normalizeAnime – cleaning', () => {
  it('strips the markup AniList leaves in descriptions', () => {
    const result = normalizeAnime({ anilist: media(), jikan: null, episodes: [] });
    expect(result.synopsis).toBe('Egy mondat.\nMásodik sor.');
    expect(result.synopsis).not.toContain('<');
  });

  it('drops spoiler tags', () => {
    const result = normalizeAnime({ anilist: media(), jikan: null, episodes: [] });
    // A tag list renders next to the synopsis; "Tragedy" above episode one is
    // not a feature, and neither is a media spoiler.
    expect(result.tags).toEqual(['Time Manipulation']);
  });

  it('puts the main studio first and merges the rest without duplicates', () => {
    const result = normalizeAnime({ anilist: media(), jikan: jikan(), episodes: [] });
    expect(result.studio).toBe('White Fox');
    expect(result.studios).toEqual(['White Fox', 'Frontier Works']);
  });

  it('skips external links with no url', () => {
    const result = normalizeAnime({ anilist: media(), jikan: null, episodes: [] });
    expect(result.externalLinks).toEqual([
      { site: 'Official Site', url: 'https://sg.tv', type: 'INFO' },
    ]);
  });

  it('keeps only anime relations', () => {
    const result = normalizeAnime({ anilist: media(), jikan: null, episodes: [] });
    expect(result.relations).toHaveLength(1);
    expect(result.relations[0]?.relation).toBe('SEQUEL');
  });
});

describe('normalizeAnime – genres', () => {
  it('maps known English names onto the seeded Hungarian slugs', () => {
    const result = normalizeAnime({ anilist: media(), jikan: jikan(), episodes: [] });
    const bySlug = Object.fromEntries(result.genres.map((genre) => [genre.slug, genre.name]));

    expect(bySlug['dráma']).toBe('Drama');
    expect(bySlug['sci-fi']).toBe('Sci-Fi');
  });

  it('still emits a genre it has no mapping for, rather than dropping it', () => {
    const result = normalizeAnime({
      anilist: media({ genres: ['Iyashikei'] }),
      jikan: null,
      episodes: [],
    });
    // Losing a genre silently is worse than carrying an English name the team
    // can rename in the admin.
    expect(result.genres).toEqual([{ slug: 'iyashikei', name: 'Iyashikei' }]);
  });

  it('merges genres, themes and demographics without duplicating', () => {
    const result = normalizeAnime({ anilist: media(), jikan: jikan(), episodes: [] });
    const names = result.genres.map((genre) => genre.name);
    expect(names).toEqual(['Drama', 'Sci-Fi', 'Suspense', 'Psychological']);
  });
});

describe('normalizeAnime – episodes', () => {
  it('carries titles, air dates and the filler flag', () => {
    const result = normalizeAnime({
      anilist: media(),
      jikan: jikan(),
      episodes: [episode(), episode({ mal_id: 2, filler: true, title: 'Filler' })],
    });

    expect(result.episodes[0]).toMatchObject({
      number: 1,
      title: 'Turning Point',
      titleNative: '第1話',
      titleRomaji: 'Tenkan Ten',
      isFiller: false,
    });
    expect(result.episodes[1]?.isFiller).toBe(true);
    expect(result.episodes[0]?.airedAt?.toISOString().slice(0, 10)).toBe('2011-04-06');
  });

  it('falls back to list position when an entry has no usable id', () => {
    const result = normalizeAnime({
      anilist: null,
      jikan: jikan(),
      episodes: [episode({ mal_id: 0 }), episode({ mal_id: 0 })],
    });
    expect(result.episodes.map((entry) => entry.number)).toEqual([1, 2]);
  });

  it('survives an unparseable air date instead of writing Invalid Date', () => {
    const result = normalizeAnime({
      anilist: null,
      jikan: jikan(),
      episodes: [episode({ aired: 'nem dátum' })],
    });
    expect(result.episodes[0]?.airedAt).toBeNull();
  });
});

describe('field helpers', () => {
  it('parses the prose duration Jikan returns', () => {
    expect(parseJikanDuration('24 min per ep')).toBe(24);
    expect(parseJikanDuration('1 hr 35 min')).toBe(95);
    expect(parseJikanDuration('2 hr')).toBe(120);
    expect(parseJikanDuration('Unknown')).toBeNull();
    expect(parseJikanDuration(null)).toBeNull();
  });

  it('only builds a date when the upstream has all three parts', () => {
    expect(aniListDate({ year: 2011, month: 4, day: 6 })?.toISOString().slice(0, 10)).toBe(
      '2011-04-06',
    );
    // A year-only date would silently become 1 January, which is a date nobody
    // stated and readers would trust.
    expect(aniListDate({ year: 2011, month: null, day: null })).toBeNull();
    expect(aniListDate(null)).toBeNull();
  });

  it('resolves trailers for the sites it can and refuses the rest', () => {
    expect(aniListTrailerUrl({ id: 'abc', site: 'youtube' })).toBe(
      'https://www.youtube.com/watch?v=abc',
    );
    expect(aniListTrailerUrl({ id: 'abc', site: 'vimeo' })).toBeNull();
    expect(aniListTrailerUrl(null)).toBeNull();
  });

  it('maps the age rating out of Jikan prose', () => {
    const rated = (rating: string) =>
      normalizeAnime({ anilist: null, jikan: jikan({ rating }), episodes: [] }).ageRating;

    expect(rated('G - All Ages')).toBe('G');
    expect(rated('PG - Children')).toBe('PG');
    expect(rated('PG-13 - Teens 13 or older')).toBe('PG13');
    expect(rated('R - 17+ (violence & profanity)')).toBe('R17');
    expect(rated('Rx - Hentai')).toBe('R18');
  });
});
