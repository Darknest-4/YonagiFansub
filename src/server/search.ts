import 'server-only';
import { db } from '@/lib/db';
import { CACHE_TAGS, CACHE_TTL, cached } from '@/lib/cache';
import { formatEpisodeNumber, truncate } from '@/lib/utils';

/**
 * Global search.
 *
 * Deliberately a two-tier design:
 *
 *   • Tier 1 (this file, default) — `ILIKE`-based prefix/substring matching over
 *     the indexed title columns. It is exact, predictable, needs no extra
 *     infrastructure, and at the catalogue size a fansub actually has (hundreds
 *     of projects, thousands of episodes) it returns in single-digit
 *     milliseconds off the trigram indexes created in `prisma/sql/search.sql`.
 *
 *   • Tier 2 (documented in `docs/architecture.md`) — Postgres full-text search
 *     with a materialised `tsvector`, behind the same interface. Worth adopting
 *     when the corpus grows enough that ranking matters more than exactness.
 *
 * Results are scored in application code so that a title prefix always beats a
 * mid-word match, and a project always beats an episode of the same relevance —
 * without which "steins" would surface episode 7 above the series itself.
 */

export type SearchResultType = 'project' | 'episode' | 'news' | 'team';

export interface SearchResult {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  href: string;
  /** Higher is better. Used for the merged ordering only. */
  score: number;
}

export interface SearchResponse {
  query: string;
  groups: Array<{ type: SearchResultType; label: string; results: SearchResult[] }>;
  total: number;
}

const TYPE_LABELS: Record<SearchResultType, string> = {
  project: 'Projektek',
  episode: 'Epizódok',
  news: 'Hírek',
  team: 'Csapat',
};

/** Base weights: a project match outranks an episode match at equal quality. */
const TYPE_WEIGHT: Record<SearchResultType, number> = {
  project: 100,
  news: 70,
  team: 60,
  episode: 50,
};

function score(type: SearchResultType, haystack: string, needle: string): number {
  const value = haystack.toLowerCase();
  const query = needle.toLowerCase();
  const index = value.indexOf(query);

  if (index === -1) return TYPE_WEIGHT[type];

  // Exact > starts-with > word-boundary > substring, then a small bonus for
  // short titles (a 12-character exact hit is more likely what was meant than a
  // 60-character one that happens to contain the term).
  let bonus = 0;
  if (value === query) bonus = 60;
  else if (index === 0) bonus = 40;
  else if (/\s|:|-/.test(value[index - 1] ?? '')) bonus = 25;
  else bonus = 10;

  return TYPE_WEIGHT[type] + bonus + Math.max(0, 20 - value.length / 4);
}

export async function search(
  query: string,
  options: { limit?: number; type?: 'all' | SearchResultType } = {},
): Promise<SearchResponse> {
  const term = query.trim();
  const limit = options.limit ?? 8;
  const type = options.type ?? 'all';

  if (term.length < 2) {
    return { query: term, groups: [], total: 0 };
  }

  const wants = (candidate: SearchResultType) => type === 'all' || type === candidate;

  const [projects, episodes, news, team] = await Promise.all([
    wants('project')
      ? db.project.findMany({
          where: {
            deletedAt: null,
            publishStatus: 'PUBLISHED',
            OR: [
              { title: { contains: term, mode: 'insensitive' } },
              { titleRomaji: { contains: term, mode: 'insensitive' } },
              { titleEnglish: { contains: term, mode: 'insensitive' } },
              { titleNative: { contains: term } },
              { synonyms: { has: term } },
              { studio: { contains: term, mode: 'insensitive' } },
            ],
          },
          select: {
            id: true,
            slug: true,
            title: true,
            titleNative: true,
            type: true,
            seasonYear: true,
            coverImageUrl: true,
          },
          take: limit * 2,
        })
      : [],

    wants('episode')
      ? db.episode.findMany({
          where: {
            deletedAt: null,
            project: { deletedAt: null, publishStatus: 'PUBLISHED' },
            OR: [
              { title: { contains: term, mode: 'insensitive' } },
              { titleNative: { contains: term } },
            ],
          },
          select: {
            id: true,
            number: true,
            title: true,
            thumbnailUrl: true,
            project: { select: { slug: true, title: true } },
          },
          take: limit,
        })
      : [],

    wants('news')
      ? db.newsPost.findMany({
          where: {
            deletedAt: null,
            status: 'PUBLISHED',
            publishedAt: { lte: new Date() },
            OR: [
              { title: { contains: term, mode: 'insensitive' } },
              { excerpt: { contains: term, mode: 'insensitive' } },
            ],
          },
          select: {
            id: true,
            slug: true,
            title: true,
            excerpt: true,
            coverImageUrl: true,
            publishedAt: true,
          },
          take: limit,
        })
      : [],

    wants('team')
      ? db.teamMember.findMany({
          where: {
            deletedAt: null,
            isActive: true,
            OR: [
              { name: { contains: term, mode: 'insensitive' } },
              { tagline: { contains: term, mode: 'insensitive' } },
            ],
          },
          select: { id: true, slug: true, name: true, tagline: true, avatarUrl: true },
          take: limit,
        })
      : [],
  ]);

  const results: SearchResult[] = [
    ...projects.map((project) => ({
      type: 'project' as const,
      id: project.id,
      title: project.title,
      subtitle: [project.titleNative, project.seasonYear ? String(project.seasonYear) : null]
        .filter(Boolean)
        .join(' · '),
      imageUrl: project.coverImageUrl,
      href: `/projektek/${project.slug}`,
      score: score('project', project.title, term),
    })),

    ...episodes.map((episode) => ({
      type: 'episode' as const,
      id: episode.id,
      title: `${episode.project.title} – ${formatEpisodeNumber(episode.number.toString())}. rész`,
      subtitle: episode.title,
      imageUrl: episode.thumbnailUrl,
      href: `/projektek/${episode.project.slug}/${formatEpisodeNumber(episode.number.toString())}`,
      score: score('episode', episode.title ?? episode.project.title, term),
    })),

    ...news.map((post) => ({
      type: 'news' as const,
      id: post.id,
      title: post.title,
      subtitle: post.excerpt ? truncate(post.excerpt, 90) : null,
      imageUrl: post.coverImageUrl,
      href: `/hirek/${post.slug}`,
      score: score('news', post.title, term),
    })),

    ...team.map((member) => ({
      type: 'team' as const,
      id: member.id,
      title: member.name,
      subtitle: member.tagline,
      imageUrl: member.avatarUrl,
      href: `/csapat/${member.slug}`,
      score: score('team', member.name, term),
    })),
  ].sort((a, b) => b.score - a.score);

  // Group while preserving the global ranking inside each group.
  const groups = (['project', 'episode', 'news', 'team'] as SearchResultType[])
    .map((groupType) => ({
      type: groupType,
      label: TYPE_LABELS[groupType],
      results: results.filter((result) => result.type === groupType).slice(0, limit),
    }))
    .filter((group) => group.results.length > 0);

  return {
    query: term,
    groups,
    total: groups.reduce((sum, group) => sum + group.results.length, 0),
  };
}

/**
 * Suggestions for an empty search box: what the team is working on right now.
 * An empty command palette is a wasted opportunity.
 */
export const getSearchSuggestions = cached(
  async () => {
    const [ongoing, latest] = await Promise.all([
      db.project.findMany({
        where: { deletedAt: null, publishStatus: 'PUBLISHED', status: 'ONGOING' },
        select: { slug: true, title: true, coverImageUrl: true },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
      db.newsPost.findMany({
        where: { deletedAt: null, status: 'PUBLISHED' },
        select: { slug: true, title: true },
        orderBy: { publishedAt: 'desc' },
        take: 3,
      }),
    ]);

    return { ongoing, latest };
  },
  ['search-suggestions'],
  { tags: [CACHE_TAGS.projects, CACHE_TAGS.news], revalidate: CACHE_TTL.medium },
);
