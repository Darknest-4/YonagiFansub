import 'server-only';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { CACHE_TAGS, CACHE_TTL, cached } from '@/lib/cache';
import {
  DEFAULT_PER_PAGE,
  paginationMeta,
  toSkipTake,
  type PaginationInput,
} from '@/lib/api/pagination';

/**
 * Public visibility filter.
 *
 * Built per call rather than held in a module constant: `new Date()` captured at
 * import time would freeze the cutoff at process boot, and a long-running server
 * would then never reveal a scheduled post.
 */
export function currentPublicFilter(): Prisma.NewsPostWhereInput {
  return { deletedAt: null, status: 'PUBLISHED', publishedAt: { lte: new Date() } };
}

export const newsCardArgs = Prisma.validator<Prisma.NewsPostDefaultArgs>()({
  select: {
    id: true,
    slug: true,
    title: true,
    excerpt: true,
    coverImageUrl: true,
    publishedAt: true,
    isPinned: true,
    viewCount: true,
    readingMinutes: true,
    category: { select: { slug: true, name: true, color: true } },
    author: { select: { username: true, displayName: true, avatarUrl: true } },
  },
});

export type NewsCard = Prisma.NewsPostGetPayload<typeof newsCardArgs>;

export interface NewsFilters {
  q?: string;
  category?: string;
  status?: Prisma.NewsPostWhereInput['status'];
  includeUnpublished?: boolean;
}

function buildWhere(filters: NewsFilters): Prisma.NewsPostWhereInput {
  const where: Prisma.NewsPostWhereInput = filters.includeUnpublished
    ? { deletedAt: null }
    : currentPublicFilter();

  if (filters.status) where.status = filters.status;
  if (filters.category) where.category = { slug: filters.category };
  if (filters.q) {
    where.OR = [
      { title: { contains: filters.q, mode: 'insensitive' } },
      { excerpt: { contains: filters.q, mode: 'insensitive' } },
      { content: { contains: filters.q, mode: 'insensitive' } },
    ];
  }

  return where;
}

export async function listNews(
  filters: NewsFilters,
  pagination: PaginationInput = { page: 1, perPage: DEFAULT_PER_PAGE },
) {
  const where = buildWhere(filters);

  const [items, total] = await Promise.all([
    db.newsPost.findMany({
      where,
      ...newsCardArgs,
      // Pinned posts lead, then reverse-chronological.
      orderBy: [{ isPinned: 'desc' }, { publishedAt: 'desc' }, { id: 'desc' }],
      ...toSkipTake(pagination),
    }),
    db.newsPost.count({ where }),
  ]);

  return { items, meta: paginationMeta(total, pagination) };
}

export const listPublicNews = cached(
  async (filtersJson: string, paginationJson: string) =>
    listNews(
      { ...(JSON.parse(filtersJson) as NewsFilters), includeUnpublished: false },
      JSON.parse(paginationJson) as PaginationInput,
    ),
  ['public-news'],
  { tags: [CACHE_TAGS.news], revalidate: CACHE_TTL.short },
);

export async function getNewsBySlug(slug: string, includeUnpublished = false) {
  return db.newsPost.findFirst({
    where: {
      slug,
      ...(includeUnpublished ? { deletedAt: null } : currentPublicFilter()),
    },
    select: {
      ...newsCardArgs.select,
      content: true,
      status: true,
      updatedAt: true,
      createdAt: true,
      author: {
        select: {
          username: true,
          displayName: true,
          avatarUrl: true,
          bio: true,
          teamMember: { select: { slug: true, tagline: true } },
        },
      },
    },
  });
}

export const getPublicNewsBySlug = cached(
  async (slug: string) => getNewsBySlug(slug, false),
  ['public-news-post'],
  { tags: [CACHE_TAGS.news], revalidate: CACHE_TTL.medium },
);

/** Related posts: same category first, then most recent, excluding the current. */
export async function getRelatedNews(
  postId: string,
  categoryId: string | null,
  limit = 3,
) {
  const sameCategory = categoryId
    ? await db.newsPost.findMany({
        where: { ...currentPublicFilter(), categoryId, id: { not: postId } },
        ...newsCardArgs,
        orderBy: { publishedAt: 'desc' },
        take: limit,
      })
    : [];

  if (sameCategory.length >= limit) return sameCategory;

  const fill = await db.newsPost.findMany({
    where: {
      ...currentPublicFilter(),
      id: { notIn: [postId, ...sameCategory.map((post) => post.id)] },
    },
    ...newsCardArgs,
    orderBy: { publishedAt: 'desc' },
    take: limit - sameCategory.length,
  });

  return [...sameCategory, ...fill];
}

export const listNewsCategories = cached(
  async () =>
    db.newsCategory.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        slug: true,
        name: true,
        color: true,
        _count: { select: { posts: { where: { deletedAt: null, status: 'PUBLISHED' } } } },
      },
    }),
  ['news-categories'],
  { tags: [CACHE_TAGS.news], revalidate: CACHE_TTL.long },
);

export async function incrementNewsView(id: string): Promise<void> {
  await db.newsPost
    .update({ where: { id }, data: { viewCount: { increment: 1 } } })
    .catch(() => undefined);
}

/** Sweep for scheduled posts – mirrors `publishDueReleases`. */
export async function publishDueNews(): Promise<number> {
  const result = await db.newsPost.updateMany({
    where: { status: 'SCHEDULED', deletedAt: null, publishedAt: { lte: new Date() } },
    data: { status: 'PUBLISHED' },
  });
  return result.count;
}
