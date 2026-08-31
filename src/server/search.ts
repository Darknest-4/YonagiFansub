import 'server-only';
import { db } from '@/lib/db';
import { CACHE_TAGS, CACHE_TTL, cached } from '@/lib/cache';
import { formatEpisodeNumber, truncate } from '@/lib/utils';
import { fullTextSearch, type FtsHit } from '@/server/search-fts';

/**
 * Global search.
 *
 * Two tiers that run together rather than one replacing the other, because they
 * fail in opposite directions:
 *
 *   • Tier 1 — `ILIKE` substring matching over the trigram-indexed title
 *     columns (`prisma/sql/02-search-indexes.sql`). Exact, predictable, and the
 *     only one of the two that finds "kaze" inside "Shiokaze".
 *
 *   • Tier 2 — Postgres full-text, ranked (`src/server/search-fts.ts`, indexes
 *     in `prisma/sql/04-fulltext.sql`). Handles stemming, multi-word queries as
 *     independent requirements, and prose: it finds a post about "nyári
 *     fesztiválok" from the word "fesztivál", which no substring match can.
 *
 * Tier 2 is optional infrastructure. A database that never ran `npm run db:sql`
 * gets tier-1 results and a single log line saying so — search never breaks over
 * a missing deployment step.
 *
 * Final ordering is computed in application code from both signals, so that a
 * title prefix always beats a mid-word match, and a project always beats an
 * episode of the same relevance — without which "steins" would surface episode 7
 * above the series itself.
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

/**
 * How much a `ts_rank_cd` score is worth on the tier-1 scale.
 *
 * Cover density with the default weights tops out around 1 for a strong title
 * hit and sits near 0.1 for a lone synopsis word, so this maps the useful range
 * onto roughly the same 0–60 band the substring bonuses use. Deliberately a
 * little below a substring hit at the top: when both signals fire, the one that
 * matched the literal characters somebody typed is the more certain of the two.
 */
const FTS_WEIGHT = 45;

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

/**
 * The better of the two signals, not their sum.
 *
 * Adding them would let a row that scrapes a weak hit from each outrank a row
 * that is an outright title match — two maybes beating one certainty, which is
 * the wrong answer every time.
 */
function combine(base: number, type: SearchResultType, ftsRank: number | undefined): number {
  if (ftsRank === undefined) return base;
  return Math.max(base, TYPE_WEIGHT[type] + Math.min(60, ftsRank * FTS_WEIGHT));
}

function rankMap(hits: FtsHit[]): Map<string, number> {
  return new Map(hits.map((hit) => [hit.id, hit.rank]));
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

  // Tier 2 runs first so its hits can be folded into the same queries that
  // fetch the tier-1 rows. One extra sequential round trip buys a single select
  // shape per entity — the alternative, running both in parallel and then
  // back-filling the ids only full-text found, means writing every select twice.
  const fts = await fullTextSearch(term, limit, wants);
  const projectRank = rankMap(fts.projects);
  const episodeRank = rankMap(fts.episodes);
  const newsRank = rankMap(fts.news);

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
              { id: { in: [...projectRank.keys()] } },
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
          // Wide enough that the full-text hits folded into the OR above cannot
          // be cut off before scoring: `findMany` has no ordering here, so a
          // tight `take` would hand back an arbitrary subset.
          take: limit * 3,
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
              { id: { in: [...episodeRank.keys()] } },
            ],
          },
          select: {
            id: true,
            number: true,
            title: true,
            thumbnailUrl: true,
            project: { select: { slug: true, title: true } },
          },
          take: limit * 3,
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
              { id: { in: [...newsRank.keys()] } },
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
          take: limit * 3,
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
      score: combine(score('project', project.title, term), 'project', projectRank.get(project.id)),
    })),

    ...episodes.map((episode) => ({
      type: 'episode' as const,
      id: episode.id,
      title: `${episode.project.title} – ${formatEpisodeNumber(episode.number.toString())}. rész`,
      subtitle: episode.title,
      imageUrl: episode.thumbnailUrl,
      href: `/projektek/${episode.project.slug}/${formatEpisodeNumber(episode.number.toString())}`,
      score: combine(
        score('episode', episode.title ?? episode.project.title, term),
        'episode',
        episodeRank.get(episode.id),
      ),
    })),

    ...news.map((post) => ({
      type: 'news' as const,
      id: post.id,
      title: post.title,
      subtitle: post.excerpt ? truncate(post.excerpt, 90) : null,
      imageUrl: post.coverImageUrl,
      href: `/hirek/${post.slug}`,
      score: combine(score('news', post.title, term), 'news', newsRank.get(post.id)),
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
