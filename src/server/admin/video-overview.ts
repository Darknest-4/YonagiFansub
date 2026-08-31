import 'server-only';
import type { VideoSourceKind } from '@prisma/client';
import { db } from '@/lib/db';

/**
 * "Which episodes can actually be watched?"
 *
 * Sources are attached one project at a time, inside the episode manager, which
 * is the right place to *edit* them and a hopeless place to audit them: finding
 * the one released episode with no playable source means opening every project
 * and expanding every episode.
 *
 * So this module answers the question from the other direction. It is read-only
 * and deliberately narrow — three queries, no mutations — because the fix for
 * anything it finds lives in the editor it links to.
 */

/** A source only counts as playable if it is published and not soft-deleted. */
const PLAYABLE = { status: 'PUBLISHED', deletedAt: null } as const;

/** Episodes the site presents as watchable. The rest are not gaps, they are work. */
const RELEASED_EPISODE = {
  deletedAt: null,
  status: 'RELEASED',
  project: { deletedAt: null },
} as const;

export interface VideoCoverageSummary {
  /** Playable sources, by kind. Zero-count kinds are present. */
  byKind: Record<VideoSourceKind, number>;
  /** Sources that exist but are not published — drafts somebody started. */
  unpublished: number;
  releasedEpisodes: number;
  /** Released episodes with at least one playable source. */
  coveredEpisodes: number;
}

export async function getVideoCoverageSummary(): Promise<VideoCoverageSummary> {
  const [kinds, unpublished, releasedEpisodes, coveredEpisodes] = await Promise.all([
    db.videoSource.groupBy({ by: ['kind'], where: PLAYABLE, _count: { _all: true } }),
    db.videoSource.count({ where: { deletedAt: null, status: { not: 'PUBLISHED' } } }),
    db.episode.count({ where: RELEASED_EPISODE }),
    db.episode.count({ where: { ...RELEASED_EPISODE, videos: { some: PLAYABLE } } }),
  ]);

  const byKind: Record<VideoSourceKind, number> = {
    HLS_PROXY: 0,
    DIRECT_FILE: 0,
    EMBED: 0,
  };
  for (const row of kinds) byKind[row.kind] = row._count._all;

  return { byKind, unpublished, releasedEpisodes, coveredEpisodes };
}

export interface CoverageGap {
  episodeId: string;
  number: number;
  title: string | null;
  projectId: string;
  projectTitle: string;
  /** Sources that exist on this episode but are not published. */
  draftSources: number;
  airedAt: Date | null;
}

/**
 * Released episodes a visitor cannot watch.
 *
 * This is the list the page exists for, so it is capped rather than paginated:
 * if there are more than a hundred, the number is the finding and a second page
 * of it would not change what anybody does next.
 */
export async function listCoverageGaps(limit = 100): Promise<CoverageGap[]> {
  const rows = await db.episode.findMany({
    where: { ...RELEASED_EPISODE, videos: { none: PLAYABLE } },
    orderBy: [{ airedAt: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    select: {
      id: true,
      number: true,
      title: true,
      airedAt: true,
      project: { select: { id: true, title: true } },
      _count: { select: { videos: { where: { deletedAt: null } } } },
    },
  });

  return rows.map((row) => ({
    episodeId: row.id,
    number: Number(row.number),
    title: row.title,
    projectId: row.project.id,
    projectTitle: row.project.title,
    draftSources: row._count.videos,
    airedAt: row.airedAt,
  }));
}

export interface ProjectCoverage {
  projectId: string;
  title: string;
  slug: string;
  released: number;
  covered: number;
  sources: number;
}

/**
 * Per-project coverage, worst first.
 *
 * Assembled in application code from three cheap aggregates rather than one
 * correlated query: Prisma cannot express "count episodes matching a relation
 * filter, grouped by project" without raw SQL, and raw SQL here would buy a
 * round trip at the cost of a query nobody could safely edit later.
 */
export async function listProjectCoverage(): Promise<ProjectCoverage[]> {
  const [projects, coveredGroups, sourceGroups] = await Promise.all([
    db.project.findMany({
      where: { deletedAt: null, episodes: { some: RELEASED_EPISODE } },
      select: {
        id: true,
        title: true,
        slug: true,
        _count: { select: { episodes: { where: RELEASED_EPISODE } } },
      },
    }),
    db.episode.groupBy({
      by: ['projectId'],
      where: { ...RELEASED_EPISODE, videos: { some: PLAYABLE } },
      _count: { _all: true },
    }),
    db.videoSource.groupBy({
      by: ['episodeId'],
      where: PLAYABLE,
      _count: { _all: true },
    }),
  ]);

  const coveredBy = new Map(coveredGroups.map((row) => [row.projectId, row._count._all]));

  // Sources group by episode, so they need one extra hop to reach a project.
  const episodeProjects = await db.episode.findMany({
    where: { id: { in: sourceGroups.map((row) => row.episodeId) } },
    select: { id: true, projectId: true },
  });
  const projectOfEpisode = new Map(episodeProjects.map((row) => [row.id, row.projectId]));

  const sourcesBy = new Map<string, number>();
  for (const row of sourceGroups) {
    const projectId = projectOfEpisode.get(row.episodeId);
    if (!projectId) continue;
    sourcesBy.set(projectId, (sourcesBy.get(projectId) ?? 0) + row._count._all);
  }

  return projects
    .map((project) => ({
      projectId: project.id,
      title: project.title,
      slug: project.slug,
      released: project._count.episodes,
      covered: coveredBy.get(project.id) ?? 0,
      sources: sourcesBy.get(project.id) ?? 0,
    }))
    .sort((a, b) => {
      // Worst ratio first, and among equals the project with more missing
      // episodes — that is the one where the work is.
      const gapA = a.released - a.covered;
      const gapB = b.released - b.covered;
      if (gapA !== gapB) return gapB - gapA;
      return a.title.localeCompare(b.title, 'hu');
    });
}
