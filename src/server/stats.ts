import 'server-only';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { CACHE_TAGS, CACHE_TTL, cached } from '@/lib/cache';

/**
 * Statistics for the admin dashboard and the public "számokban" strip.
 *
 * Every figure here is derived with an aggregate query rather than by loading
 * rows and counting in JavaScript — the difference is invisible at 100 rows and
 * decisive at 100 000.
 */

export interface DashboardStats {
  projects: { total: number; ongoing: number; completed: number; draft: number };
  episodes: { total: number; released: number; inProgress: number };
  releases: { total: number; published: number; scheduled: number; thisMonth: number };
  users: { total: number; active: number; newThisMonth: number };
  downloads: { total: number; last7Days: number; last30Days: number };
  contact: { new: number; inProgress: number };
  comments: { pending: number };
}

function startOfMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const monthStart = startOfMonth();

  const [
    projectsTotal,
    projectsOngoing,
    projectsCompleted,
    projectsDraft,
    episodesTotal,
    episodesReleased,
    episodesInProgress,
    releasesTotal,
    releasesPublished,
    releasesScheduled,
    releasesThisMonth,
    usersTotal,
    usersActive,
    usersNew,
    downloadsTotal,
    downloads7,
    downloads30,
    contactNew,
    contactInProgress,
    commentsPending,
  ] = await Promise.all([
    db.project.count({ where: { deletedAt: null } }),
    db.project.count({ where: { deletedAt: null, status: 'ONGOING' } }),
    db.project.count({ where: { deletedAt: null, status: 'COMPLETED' } }),
    db.project.count({ where: { deletedAt: null, publishStatus: 'DRAFT' } }),

    db.episode.count({ where: { deletedAt: null } }),
    db.episode.count({ where: { deletedAt: null, status: 'RELEASED' } }),
    db.episode.count({ where: { deletedAt: null, status: { in: ['IN_PROGRESS', 'QC'] } } }),

    db.release.count({ where: { deletedAt: null } }),
    db.release.count({ where: { deletedAt: null, status: 'PUBLISHED' } }),
    db.release.count({ where: { deletedAt: null, status: 'SCHEDULED' } }),
    db.release.count({
      where: { deletedAt: null, status: 'PUBLISHED', releasedAt: { gte: monthStart } },
    }),

    db.user.count({ where: { deletedAt: null } }),
    db.user.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
    db.user.count({ where: { deletedAt: null, createdAt: { gte: monthStart } } }),

    db.downloadEvent.count(),
    db.downloadEvent.count({ where: { createdAt: { gte: daysAgo(7) } } }),
    db.downloadEvent.count({ where: { createdAt: { gte: daysAgo(30) } } }),

    db.contactMessage.count({ where: { status: 'NEW' } }),
    db.contactMessage.count({ where: { status: 'IN_PROGRESS' } }),

    db.comment.count({ where: { status: 'PENDING', deletedAt: null } }),
  ]);

  return {
    projects: {
      total: projectsTotal,
      ongoing: projectsOngoing,
      completed: projectsCompleted,
      draft: projectsDraft,
    },
    episodes: {
      total: episodesTotal,
      released: episodesReleased,
      inProgress: episodesInProgress,
    },
    releases: {
      total: releasesTotal,
      published: releasesPublished,
      scheduled: releasesScheduled,
      thisMonth: releasesThisMonth,
    },
    users: { total: usersTotal, active: usersActive, newThisMonth: usersNew },
    downloads: { total: downloadsTotal, last7Days: downloads7, last30Days: downloads30 },
    contact: { new: contactNew, inProgress: contactInProgress },
    comments: { pending: commentsPending },
  };
}

/** Daily download counts for the dashboard sparkline. */
export async function getDownloadTrend(days = 30): Promise<Array<{ date: string; count: number }>> {
  const since = daysAgo(days);

  const rows = await db.$queryRaw<Array<{ day: Date; count: bigint }>>`
    SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
    FROM download_events
    WHERE "createdAt" >= ${since}
    GROUP BY day
    ORDER BY day ASC
  `;

  // Fill the gaps: a missing day is zero downloads, not a missing data point.
  const byDay = new Map(
    rows.map((row) => [row.day.toISOString().slice(0, 10), Number(row.count)]),
  );

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(Date.now() - (days - 1 - index) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    return { date, count: byDay.get(date) ?? 0 };
  });
}

/**
 * Daily counts for one table's `createdAt`, gap-filled.
 *
 * The table name is interpolated with `Prisma.raw` because a placeholder cannot
 * stand in for an identifier — so it is deliberately **not** a parameter of the
 * exported API. Only the fixed literals in `DASHBOARD_SERIES` below ever reach
 * it, which keeps this from becoming an injection point the day somebody wires
 * it to a query string.
 */
async function dailyCounts(table: string, days: number): Promise<number[]> {
  const rows = await db.$queryRaw<Array<{ day: Date; count: bigint }>>`
    SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
    FROM ${Prisma.raw(`"${table}"`)}
    WHERE "createdAt" >= ${daysAgo(days)}
    GROUP BY day
    ORDER BY day ASC
  `;

  const byDay = new Map(rows.map((row) => [row.day.toISOString().slice(0, 10), Number(row.count)]));

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(Date.now() - (days - 1 - index) * 86_400_000).toISOString().slice(0, 10);
    return byDay.get(date) ?? 0;
  });
}

/** The only table names `dailyCounts` is ever called with. */
const DASHBOARD_SERIES = {
  downloads: 'download_events',
  releases: 'releases',
  users: 'users',
  episodes: 'episodes',
  projects: 'projects',
} as const;

export interface DashboardTrends {
  downloads: number[];
  releases: number[];
  users: number[];
  episodes: number[];
  projects: number[];
}

/**
 * Fourteen-day series for the stat tiles.
 *
 * Fourteen rather than thirty: the tile chart is 120px wide, so thirty points
 * put a data point every four pixels and the line stops reading as a trend and
 * starts reading as noise. Two weeks also gives an honest week-over-week delta.
 */
export async function getDashboardTrends(days = 14): Promise<DashboardTrends> {
  const [downloads, releases, users, episodes, projects] = await Promise.all([
    dailyCounts(DASHBOARD_SERIES.downloads, days),
    dailyCounts(DASHBOARD_SERIES.releases, days),
    dailyCounts(DASHBOARD_SERIES.users, days),
    dailyCounts(DASHBOARD_SERIES.episodes, days),
    dailyCounts(DASHBOARD_SERIES.projects, days),
  ]);

  return { downloads, releases, users, episodes, projects };
}

/**
 * Percentage change of the last half of a series against the first half.
 *
 * Returns `null` when the earlier period is empty. A jump from zero is not
 * "+100%" or "+∞%" — it is a first data point, and any percentage put on it
 * would be a number the dashboard made up.
 */
export function periodDelta(series: number[]): number | null {
  if (series.length < 4) return null;

  const half = Math.floor(series.length / 2);
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

  const previous = sum(series.slice(0, half));
  if (previous === 0) return null;

  return Math.round(((sum(series.slice(half)) - previous) / previous) * 100);
}

export interface ProjectProgressRow {
  id: string;
  slug: string;
  title: string;
  status: string;
  coverImageUrl: string | null;
  releasedEpisodes: number;
  totalEpisodes: number;
  /** Mean completion across the episodes still in flight, or `null` if none are. */
  progress: number | null;
}

/**
 * Progress board for the dashboard.
 *
 * Answers "which project is moving and which is stuck", which is the question a
 * fansub admin actually opens the dashboard with. Ordered by most recently
 * touched, because a stalled project is only interesting next to the ones that
 * are not.
 *
 * The average covers only unreleased episodes: including finished ones would
 * drag every bar toward 100% and make a project with ten released episodes and
 * one barely-started look nearly done.
 */
export async function getProjectProgressBoard(limit = 6): Promise<ProjectProgressRow[]> {
  const projects = await db.project.findMany({
    where: { deletedAt: null, status: { in: ['ONGOING', 'ANNOUNCED'] } },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      coverImageUrl: true,
      episodes: {
        where: { deletedAt: null },
        select: {
          status: true,
          progressTranslation: true,
          progressEditing: true,
          progressTiming: true,
          progressTypesetting: true,
          progressEncoding: true,
          progressQc: true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });

  return projects.map((project) => {
    const pending = project.episodes.filter((episode) => episode.status !== 'RELEASED');

    const progress =
      pending.length === 0
        ? null
        : Math.round(
            pending.reduce(
              (total, episode) =>
                total +
                (episode.progressTranslation +
                  episode.progressEditing +
                  episode.progressTiming +
                  episode.progressTypesetting +
                  episode.progressEncoding +
                  episode.progressQc) /
                  6,
              0,
            ) / pending.length,
          );

    return {
      id: project.id,
      slug: project.slug,
      title: project.title,
      status: project.status,
      coverImageUrl: project.coverImageUrl,
      releasedEpisodes: project.episodes.filter((episode) => episode.status === 'RELEASED').length,
      totalEpisodes: project.episodes.length,
      progress,
    };
  });
}

export async function getTopReleases(limit = 8) {
  return db.release.findMany({
    where: { deletedAt: null, status: 'PUBLISHED' },
    select: {
      id: true,
      version: true,
      resolution: true,
      downloadCount: true,
      releasedAt: true,
      episode: { select: { number: true } },
      project: { select: { slug: true, title: true, coverImageUrl: true } },
    },
    orderBy: { downloadCount: 'desc' },
    take: limit,
  });
}

export async function getRecentActivity(limit = 12) {
  return db.auditLog.findMany({
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      summary: true,
      actorLabel: true,
      createdAt: true,
      actor: { select: { username: true, displayName: true, avatarUrl: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/** Public "in numbers" strip on the home page. */
export const getPublicStats = cached(
  async () => {
    const [projects, episodes, releases, members, downloads] = await Promise.all([
      db.project.count({ where: { deletedAt: null, publishStatus: 'PUBLISHED' } }),
      db.episode.count({
        where: {
          deletedAt: null,
          status: 'RELEASED',
          project: { deletedAt: null, publishStatus: 'PUBLISHED' },
        },
      }),
      db.release.count({ where: { deletedAt: null, status: 'PUBLISHED' } }),
      db.teamMember.count({ where: { deletedAt: null, isActive: true } }),
      db.release.aggregate({
        where: { deletedAt: null, status: 'PUBLISHED' },
        _sum: { downloadCount: true },
      }),
    ]);

    return {
      projects,
      episodes,
      releases,
      members,
      downloads: downloads._sum.downloadCount ?? 0,
    };
  },
  ['public-stats'],
  { tags: [CACHE_TAGS.stats], revalidate: CACHE_TTL.long },
);
