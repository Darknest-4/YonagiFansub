import 'server-only';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { CACHE_TAGS, CACHE_TTL, cached } from '@/lib/cache';
import {
  DEFAULT_PER_PAGE,
  paginationMeta,
  parseSort,
  toOrderBy,
  toSkipTake,
  type PaginationInput,
} from '@/lib/api/pagination';
import { PROJECT_SORTS } from '@/lib/validation/schemas';

/**
 * Project (anime) read model.
 *
 * The public site only ever sees `PUBLISHED`, non-deleted rows; the admin panel
 * passes `includeUnpublished`. That flag lives in exactly one place — the
 * `visibilityFilter` helper — so no query can leak a draft by accident.
 *
 * Every reusable projection is declared through `Prisma.validator` rather than
 * as a plain object with `satisfies`. A bare `const` widens `true` to `boolean`,
 * which makes Prisma's result inference fall back to the *full* model type and
 * silently drops the guarantee that a page can only read what it selected.
 * `validator` pins the literals, so the payload types below are exact.
 */

export const publicProjectFilter = {
  deletedAt: null,
  publishStatus: 'PUBLISHED',
} satisfies Prisma.ProjectWhereInput;

/**
 * Returns a **fresh** filter object every call.
 *
 * Handing back the shared `publicProjectFilter` reference would be a live
 * cross-request bug: `buildWhere` mutates the object it is given (`where.status
 * = …`, `where.OR = …`), so one filtered catalogue query would permanently
 * poison the module-level constant, and every later lookup that spread it would
 * silently match nothing. The spread is not a micro-optimisation to skip.
 */
function visibilityFilter(includeUnpublished: boolean): Prisma.ProjectWhereInput {
  return includeUnpublished ? { deletedAt: null } : { ...publicProjectFilter };
}

/** Card projection: everything the grid renders, and nothing else. */
export const projectCardArgs = Prisma.validator<Prisma.ProjectDefaultArgs>()({
  select: {
    id: true,
    slug: true,
    title: true,
    titleNative: true,
    type: true,
    status: true,
    season: true,
    seasonYear: true,
    totalEpisodes: true,
    coverImageUrl: true,
    accentColor: true,
    isFeatured: true,
    publishedAt: true,
    updatedAt: true,
    viewCount: true,
    genres: { select: { genre: { select: { slug: true, name: true, color: true } } } },
    _count: { select: { episodes: { where: { deletedAt: null, status: 'RELEASED' } } } },
  },
});

export type ProjectCard = Prisma.ProjectGetPayload<typeof projectCardArgs>;

export interface ProjectListFilters {
  q?: string;
  status?: Prisma.ProjectWhereInput['status'];
  type?: Prisma.ProjectWhereInput['type'];
  genres?: string[];
  season?: Prisma.ProjectWhereInput['season'];
  year?: number;
  featured?: boolean;
  sort?: string;
  includeUnpublished?: boolean;
}

function buildWhere(filters: ProjectListFilters): Prisma.ProjectWhereInput {
  const where: Prisma.ProjectWhereInput = visibilityFilter(filters.includeUnpublished ?? false);

  if (filters.status) where.status = filters.status;
  if (filters.type) where.type = filters.type;
  if (filters.season) where.season = filters.season;
  if (filters.year) where.seasonYear = filters.year;
  if (filters.featured !== undefined) where.isFeatured = filters.featured;

  if (filters.genres?.length) {
    // AND semantics: selecting two genres narrows the result, it does not widen it.
    where.AND = filters.genres.map((genreSlug) => ({
      genres: { some: { genre: { slug: genreSlug } } },
    }));
  }

  if (filters.q) {
    where.OR = [
      { title: { contains: filters.q, mode: 'insensitive' } },
      { titleRomaji: { contains: filters.q, mode: 'insensitive' } },
      { titleEnglish: { contains: filters.q, mode: 'insensitive' } },
      { titleNative: { contains: filters.q } },
      { synonyms: { has: filters.q } },
      { studio: { contains: filters.q, mode: 'insensitive' } },
    ];
  }

  return where;
}

export async function listProjects(
  filters: ProjectListFilters,
  pagination: PaginationInput = { page: 1, perPage: DEFAULT_PER_PAGE },
) {
  const where = buildWhere(filters);
  const sort = parseSort(filters.sort, PROJECT_SORTS, { field: 'publishedAt', direction: 'desc' });

  const [items, total] = await Promise.all([
    db.project.findMany({
      where,
      ...projectCardArgs,
      // The secondary key keeps the sort deterministic, so pagination never
      // repeats or drops a row when two projects share a timestamp.
      orderBy: [toOrderBy(sort), { id: 'desc' }],
      ...toSkipTake(pagination),
    }),
    db.project.count({ where }),
  ]);

  return { items, meta: paginationMeta(total, pagination) };
}

/** Cached variant used by the public catalogue page. */
export const listPublicProjects = cached(
  async (filtersJson: string, paginationJson: string) => {
    const filters = JSON.parse(filtersJson) as ProjectListFilters;
    const pagination = JSON.parse(paginationJson) as PaginationInput;
    return listProjects({ ...filters, includeUnpublished: false }, pagination);
  },
  ['public-projects'],
  { tags: [CACHE_TAGS.projects], revalidate: CACHE_TTL.short },
);

export const projectDetailArgs = Prisma.validator<Prisma.ProjectDefaultArgs>()({
  select: {
    id: true,
    slug: true,
    title: true,
    titleRomaji: true,
    titleNative: true,
    titleEnglish: true,
    synonyms: true,
    synopsis: true,
    type: true,
    status: true,
    publishStatus: true,
    season: true,
    seasonYear: true,
    totalEpisodes: true,
    ageRating: true,
    studio: true,
    source: true,
    durationMin: true,
    // Imported metadata. Stored by the AniList/Jikan sync and rendered on the
    // detail page — a field written every night and shown nowhere is just a
    // slower way of having no data.
    studios: true,
    producers: true,
    licensors: true,
    tags: true,
    averageScore: true,
    malScore: true,
    startDate: true,
    endDate: true,
    countryOfOrigin: true,
    externalLinks: true,
    relations: true,
    coverImageUrl: true,
    bannerImageUrl: true,
    trailerUrl: true,
    accentColor: true,
    malId: true,
    anilistId: true,
    isFeatured: true,
    publishedAt: true,
    viewCount: true,
    createdAt: true,
    updatedAt: true,
    genres: { select: { genre: { select: { id: true, slug: true, name: true, color: true } } } },
    staff: {
      select: {
        id: true,
        position: { select: { key: true, name: true, icon: true, color: true, sortOrder: true } },
        teamMember: { select: { slug: true, name: true, avatarUrl: true, isActive: true } },
      },
    },
    _count: { select: { episodes: { where: { deletedAt: null } }, favorites: true } },
  },
});

export type ProjectDetail = Prisma.ProjectGetPayload<typeof projectDetailArgs>;

export async function getProjectBySlug(slug: string, includeUnpublished = false) {
  return db.project.findFirst({
    where: { slug, ...visibilityFilter(includeUnpublished) },
    ...projectDetailArgs,
  });
}

export const getPublicProjectBySlug = cached(
  async (slug: string) => getProjectBySlug(slug, false),
  ['public-project'],
  { tags: [CACHE_TAGS.projects], revalidate: CACHE_TTL.medium },
);

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

export async function getEpisode(projectSlug: string, episodeNumber: number) {
  return db.episode.findFirst({
    where: {
      deletedAt: null,
      number: episodeNumber,
      project: { slug: projectSlug, ...publicProjectFilter },
    },
    ...episodeDetailArgs,
  });
}

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

export const listGenres = cached(
  async () =>
    db.genre.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        slug: true,
        name: true,
        color: true,
        _count: { select: { projects: true } },
      },
    }),
  ['genres'],
  { tags: [CACHE_TAGS.genres], revalidate: CACHE_TTL.day },
);

/** Distinct season/year pairs, for the catalogue filter dropdown. */
export const listSeasons = cached(
  async () => {
    const rows = await db.project.findMany({
      where: { ...publicProjectFilter, seasonYear: { not: null } },
      select: { season: true, seasonYear: true },
      distinct: ['season', 'seasonYear'],
      orderBy: [{ seasonYear: 'desc' }, { season: 'asc' }],
    });

    return rows.filter(
      (row): row is { season: NonNullable<typeof row.season>; seasonYear: number } =>
        Boolean(row.season && row.seasonYear),
    );
  },
  ['seasons'],
  { tags: [CACHE_TAGS.projects], revalidate: CACHE_TTL.day },
);

/**
 * View counter.
 *
 * Deliberately fire-and-forget: a page render must never block on, or fail
 * because of, a statistics write.
 */
export async function incrementProjectView(id: string): Promise<void> {
  await db.project
    .update({ where: { id }, data: { viewCount: { increment: 1 } } })
    .catch(() => undefined);
}

/** Hero projection – the card fields plus what the full-bleed banner needs. */
export const featuredProjectArgs = Prisma.validator<Prisma.ProjectDefaultArgs>()({
  select: {
    ...projectCardArgs.select,
    bannerImageUrl: true,
    synopsis: true,
    trailerUrl: true,
  },
});

export type FeaturedProject = Prisma.ProjectGetPayload<typeof featuredProjectArgs>;

export const getFeaturedProjects = cached(
  async (limit = 5) =>
    db.project.findMany({
      where: { ...publicProjectFilter, isFeatured: true },
      ...featuredProjectArgs,
      orderBy: [{ publishedAt: 'desc' }],
      take: limit,
    }),
  ['featured-projects'],
  { tags: [CACHE_TAGS.projects], revalidate: CACHE_TTL.medium },
);

export const getOngoingProjects = cached(
  async (limit = 12) =>
    db.project.findMany({
      where: { ...publicProjectFilter, status: 'ONGOING' },
      ...projectCardArgs,
      orderBy: [{ updatedAt: 'desc' }],
      take: limit,
    }),
  ['ongoing-projects'],
  { tags: [CACHE_TAGS.projects], revalidate: CACHE_TTL.short },
);
