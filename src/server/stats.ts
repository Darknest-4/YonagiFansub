import 'server-only';
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
