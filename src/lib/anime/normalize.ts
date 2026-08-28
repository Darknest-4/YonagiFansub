import 'server-only';
import type { AgeRating, AnimeSeason, ProjectStatus, ProjectType } from '@prisma/client';
import {
  aniListDate,
  aniListTrailerUrl,
  type AniListMedia,
} from '@/lib/anime/anilist';
import { parseJikanDuration, type JikanAnime, type JikanEpisode } from '@/lib/anime/jikan';
import { slugify } from '@/lib/utils';

/**
 * Merging AniList and Jikan into one shape.
 *
 * The two sources overlap heavily and disagree in small ways, so each field has
 * one designated winner rather than a general "first non-null" rule:
 *
 *   • **AniList wins** on structured data — dates as parts, enums, tags, the
 *     banner image, relations. Its schema is typed; Jikan re-serialises MAL's
 *     HTML and its values arrive as prose ("24 min per ep").
 *   • **Jikan wins** on MAL's own numbers (the MAL score is by definition MAL's)
 *     and on producers/licensors, which AniList does not model separately.
 *   • **Episode titles come from Jikan only.** AniList has no per-episode title
 *     list, and episode titles are the reason this import exists at all.
 *
 * Either source alone produces a usable result; the caller decides which ids it
 * has.
 */

/** AniList's `format` and Jikan's `type`, onto our narrower set. */
const TYPE_MAP: Record<string, ProjectType> = {
  TV: 'TV',
  TV_SHORT: 'TV',
  MOVIE: 'MOVIE',
  SPECIAL: 'SPECIAL',
  OVA: 'OVA',
  ONA: 'ONA',
  MUSIC: 'MUSIC',
};

/**
 * Upstream airing status onto our workflow status.
 *
 * Only ever used to seed a **new** project. Our `status` answers "where is the
 * team with this", not "is it on the air" — a show that finished airing years
 * ago can still be ONGOING for us, and a resync that rewrote it to COMPLETED
 * would erase the team's own decision. `toProjectUpdate` therefore never
 * touches it.
 */
const STATUS_SEED: Record<string, ProjectStatus> = {
  RELEASING: 'ONGOING',
  FINISHED: 'ANNOUNCED',
  NOT_YET_RELEASED: 'ANNOUNCED',
  CANCELLED: 'ANNOUNCED',
  HIATUS: 'ON_HOLD',
};

const SEASON_MAP: Record<string, AnimeSeason> = {
  WINTER: 'WINTER',
  SPRING: 'SPRING',
  SUMMER: 'SUMMER',
  FALL: 'FALL',
};

/** AniList `source(version: 3)` values, as Hungarian prose for display. */
const SOURCE_MAP: Record<string, string> = {
  ORIGINAL: 'Eredeti',
  MANGA: 'Manga',
  LIGHT_NOVEL: 'Light novel',
  VISUAL_NOVEL: 'Visual novel',
  VIDEO_GAME: 'Videojáték',
  NOVEL: 'Regény',
  DOUJINSHI: 'Doujinshi',
  ANIME: 'Anime',
  WEB_NOVEL: 'Webregény',
  LIVE_ACTION: 'Élőszereplős',
  GAME: 'Játék',
  COMIC: 'Képregény',
  MULTIMEDIA_PROJECT: 'Multimédia-projekt',
  PICTURE_BOOK: 'Képeskönyv',
  OTHER: 'Egyéb',
};

/**
 * Genre names as the upstreams write them, onto the slugs the seed creates.
 *
 * A name that is not here still becomes a genre — created from its English name,
 * which the team can rename in the admin. Dropping it instead would silently
 * lose a genre and leave no trace that anything was missing.
 */
const GENRE_SLUGS: Record<string, string> = {
  action: 'akcio',
  adventure: 'kaland',
  comedy: 'vígjáték',
  drama: 'dráma',
  fantasy: 'fantasy',
  horror: 'horror',
  mystery: 'misztikus',
  psychological: 'pszichologiai',
  romance: 'romantikus',
  'sci-fi': 'sci-fi',
  'slice of life': 'szeletek',
  sports: 'sport',
  supernatural: 'termeszetfeletti',
  thriller: 'thriller',
  mecha: 'mecha',
  music: 'zene',
  ecchi: 'ecchi',
  'mahou shoujo': 'mahou-shoujo',
  'award winning': 'dijnyertes',
  'avant garde': 'avantgard',
  'boys love': 'boys-love',
  'girls love': 'girls-love',
  gourmet: 'gasztro',
  school: 'iskola',
  seinen: 'seinen',
  shounen: 'shounen',
  shoujo: 'shoujo',
  josei: 'josei',
};

/** Jikan's `rating` prose onto our age rating enum. */
function toAgeRating(rating: string | null | undefined): AgeRating | null {
  if (!rating) return null;
  const value = rating.toLowerCase();
  if (value.startsWith('g -')) return 'G';
  if (value.startsWith('pg-13')) return 'PG13';
  if (value.startsWith('pg')) return 'PG';
  if (value.startsWith('rx')) return 'R18';
  if (value.startsWith('r+')) return 'R18';
  if (value.startsWith('r -')) return 'R17';
  return null;
}

/**
 * AniList descriptions carry a little HTML even with `asHtml: false`, because
 * the field is authored as markup upstream. Stripping the tags here keeps the
 * markup out of a field we render as text.
 */
function stripHtml(input: string | null | undefined): string | null {
  if (!input) return null;
  const text = input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text || null;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))];
}

export interface NormalizedGenre {
  slug: string;
  name: string;
}

export interface NormalizedEpisode {
  number: number;
  title: string | null;
  titleRomaji: string | null;
  titleNative: string | null;
  airedAt: Date | null;
  isFiller: boolean;
  isRecap: boolean;
}

export interface NormalizedAnime {
  anilistId: number | null;
  malId: number | null;

  titleRomaji: string | null;
  titleEnglish: string | null;
  titleNative: string | null;
  /** Best available display title, used only when creating a project. */
  displayTitle: string;
  synonyms: string[];

  synopsis: string | null;
  type: ProjectType | null;
  seedStatus: ProjectStatus | null;
  season: AnimeSeason | null;
  seasonYear: number | null;
  totalEpisodes: number | null;
  durationMin: number | null;
  ageRating: AgeRating | null;
  source: string | null;

  startDate: Date | null;
  endDate: Date | null;

  studio: string | null;
  studios: string[];
  producers: string[];
  licensors: string[];
  tags: string[];

  averageScore: number | null;
  malScore: number | null;
  popularity: number | null;
  favourites: number | null;

  countryOfOrigin: string | null;
  hashtag: string | null;
  isAdult: boolean;

  coverImageUrl: string | null;
  bannerImageUrl: string | null;
  trailerUrl: string | null;
  accentColor: string | null;

  externalLinks: Array<{ site: string; url: string; type: string | null }>;
  relations: Array<{
    relation: string;
    anilistId: number | null;
    malId: number | null;
    title: string;
  }>;

  genres: NormalizedGenre[];
  episodes: NormalizedEpisode[];
  /** True when the episode list was cut short by the page cap. */
  episodesTruncated: boolean;

  sources: string[];
}

function toGenre(name: string): NormalizedGenre {
  const key = name.trim().toLowerCase();
  return { slug: GENRE_SLUGS[key] ?? slugify(name), name: name.trim() };
}

function toEpisode(episode: JikanEpisode, index: number): NormalizedEpisode {
  const aired = episode.aired ? new Date(episode.aired) : null;

  return {
    // `mal_id` on an episode row is its number in the series, but it is not
    // guaranteed present on every entry; the list order is, so it is the
    // fallback rather than the primary.
    number: Number.isFinite(episode.mal_id) && episode.mal_id > 0 ? episode.mal_id : index + 1,
    title: episode.title?.trim() || null,
    titleRomaji: episode.title_romanji?.trim() || null,
    titleNative: episode.title_japanese?.trim() || null,
    airedAt: aired && !Number.isNaN(aired.getTime()) ? aired : null,
    isFiller: Boolean(episode.filler),
    isRecap: Boolean(episode.recap),
  };
}

export function normalizeAnime(input: {
  anilist: AniListMedia | null;
  jikan: JikanAnime | null;
  episodes: JikanEpisode[];
  episodesTruncated?: boolean;
}): NormalizedAnime {
  const { anilist, jikan, episodes, episodesTruncated = false } = input;

  const titleRomaji = anilist?.title.romaji ?? jikan?.title ?? null;
  const titleEnglish = anilist?.title.english ?? jikan?.title_english ?? null;
  const titleNative = anilist?.title.native ?? jikan?.title_japanese ?? null;

  const mainStudios = (anilist?.studios.edges ?? [])
    .filter((edge) => edge.isMain)
    .map((edge) => edge.node.name);
  const allStudios = uniqueStrings([
    ...mainStudios,
    ...(anilist?.studios.edges ?? []).map((edge) => edge.node.name),
    ...(jikan?.studios ?? []).map((studio) => studio.name),
  ]);

  const genreNames = uniqueStrings([
    ...(anilist?.genres ?? []),
    ...(jikan?.genres ?? []).map((genre) => genre.name),
    ...(jikan?.themes ?? []).map((theme) => theme.name),
    ...(jikan?.demographics ?? []).map((demographic) => demographic.name),
  ]);

  // Spoiler tags are excluded. A tag list is rendered on a public page next to
  // the synopsis, and "Major Character Death" above episode one is not a
  // feature.
  const tags = (anilist?.tags ?? [])
    .filter((tag) => !tag.isGeneralSpoiler && !tag.isMediaSpoiler)
    .sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))
    .slice(0, 15)
    .map((tag) => tag.name);

  const cover =
    anilist?.coverImage?.extraLarge ??
    anilist?.coverImage?.large ??
    jikan?.images?.webp?.large_image_url ??
    jikan?.images?.jpg?.large_image_url ??
    null;

  const trailer =
    aniListTrailerUrl(anilist?.trailer) ??
    (jikan?.trailer?.youtube_id
      ? `https://www.youtube.com/watch?v=${jikan.trailer.youtube_id}`
      : (jikan?.trailer?.url ?? null));

  const displayTitle = titleRomaji || titleEnglish || titleNative || `#${anilist?.id ?? jikan?.mal_id ?? '?'}`;

  const jikanAiredFrom = jikan?.aired?.from ? new Date(jikan.aired.from) : null;
  const jikanAiredTo = jikan?.aired?.to ? new Date(jikan.aired.to) : null;

  return {
    anilistId: anilist?.id ?? null,
    malId: anilist?.idMal ?? jikan?.mal_id ?? null,

    titleRomaji,
    titleEnglish,
    titleNative,
    displayTitle,
    synonyms: uniqueStrings([
      ...(anilist?.synonyms ?? []),
      ...(jikan?.title_synonyms ?? []),
    ]).slice(0, 20),

    synopsis: stripHtml(anilist?.description) ?? jikan?.synopsis?.trim() ?? null,
    type: TYPE_MAP[anilist?.format ?? ''] ?? TYPE_MAP[(jikan?.type ?? '').toUpperCase()] ?? null,
    seedStatus: STATUS_SEED[anilist?.status ?? ''] ?? null,
    season: SEASON_MAP[anilist?.season ?? ''] ?? SEASON_MAP[(jikan?.season ?? '').toUpperCase()] ?? null,
    seasonYear: anilist?.seasonYear ?? jikan?.year ?? null,
    totalEpisodes: anilist?.episodes ?? jikan?.episodes ?? null,
    durationMin: anilist?.duration ?? parseJikanDuration(jikan?.duration),
    ageRating: toAgeRating(jikan?.rating),
    source: SOURCE_MAP[anilist?.source ?? ''] ?? jikan?.source ?? null,

    startDate: aniListDate(anilist?.startDate) ?? (jikanAiredFrom && !Number.isNaN(jikanAiredFrom.getTime()) ? jikanAiredFrom : null),
    endDate: aniListDate(anilist?.endDate) ?? (jikanAiredTo && !Number.isNaN(jikanAiredTo.getTime()) ? jikanAiredTo : null),

    studio: mainStudios[0] ?? allStudios[0] ?? null,
    studios: allStudios,
    producers: uniqueStrings((jikan?.producers ?? []).map((producer) => producer.name)),
    licensors: uniqueStrings((jikan?.licensors ?? []).map((licensor) => licensor.name)),
    tags,

    averageScore: anilist?.averageScore ?? null,
    malScore: jikan?.score ?? null,
    popularity: anilist?.popularity ?? jikan?.members ?? null,
    favourites: anilist?.favourites ?? jikan?.favorites ?? null,

    countryOfOrigin: anilist?.countryOfOrigin ?? null,
    hashtag: anilist?.hashtag ?? null,
    isAdult: Boolean(anilist?.isAdult),

    coverImageUrl: cover,
    bannerImageUrl: anilist?.bannerImage ?? null,
    trailerUrl: trailer,
    accentColor: anilist?.coverImage?.color ?? null,

    externalLinks: (anilist?.externalLinks ?? [])
      .filter((link): link is { site: string; url: string; type: string | null } =>
        Boolean(link.site && link.url),
      )
      .map((link) => ({ site: link.site, url: link.url, type: link.type }))
      .slice(0, 25),

    relations: (anilist?.relations.edges ?? [])
      .filter((edge) => edge.node.type === 'ANIME' && edge.relationType)
      .map((edge) => ({
        relation: edge.relationType!,
        anilistId: edge.node.id,
        malId: edge.node.idMal,
        title: edge.node.title.romaji || edge.node.title.english || `#${edge.node.id}`,
      }))
      .slice(0, 30),

    genres: genreNames.map(toGenre),
    episodes: episodes.map(toEpisode),
    episodesTruncated,

    sources: uniqueStrings([anilist ? 'anilist' : null, jikan ? 'jikan' : null]),
  };
}
