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
import { RELEASE_SORTS } from '@/lib/validation/schemas';
import { NotFoundError } from '@/lib/errors';
import { logger } from '@/lib/logger';

/**
 * Release read model + the download resolution flow.
 *
 * The public feed is the busiest query on the site, so its projection is kept
 * tight and it is cached by tag rather than by TTL — a publish invalidates it
 * immediately, and nothing else re-runs it.
 */

const publicReleaseFilter = {
  deletedAt: null,
  status: 'PUBLISHED',
  project: { deletedAt: null, publishStatus: 'PUBLISHED' },
} satisfies Prisma.ReleaseWhereInput;

export const releaseFeedArgs = Prisma.validator<Prisma.ReleaseDefaultArgs>()({
  select: {
    id: true,
    kind: true,
    version: true,
    resolution: true,
    // Always PUBLISHED on the public feed, but the admin table reuses this
    // projection and needs the real value.
    status: true,
    videoCodec: true,
    audioCodec: true,
    fileSizeBytes: true,
    releasedAt: true,
    downloadCount: true,
    changelog: true,
    format: { select: { key: true, label: true, container: true } },
    episode: { select: { number: true, title: true, thumbnailUrl: true } },
    project: {
      select: {
        slug: true,
        title: true,
        titleNative: true,
        coverImageUrl: true,
        accentColor: true,
        type: true,
      },
    },
    _count: { select: { links: true } },
  },
});

type ReleaseFeedRow = Prisma.ReleaseGetPayload<typeof releaseFeedArgs>;

/**
 * The shape callers actually receive.
 *
 * `fileSizeBytes` is a `BigInt` in the database and a **string** here. BigInt
 * cannot be JSON-serialised, which means it survives neither Next's data cache
 * nor the server→client component boundary — both fail at runtime, not at
 * compile time. Converting once at the service boundary removes the whole class
 * of bug instead of leaving every consumer to remember.
 */
export type ReleaseFeedItem = Omit<ReleaseFeedRow, 'fileSizeBytes'> & {
  fileSizeBytes: string | null;
};

function toFeedItem(row: ReleaseFeedRow): ReleaseFeedItem {
  return { ...row, fileSizeBytes: row.fileSizeBytes?.toString() ?? null };
}

export interface ReleaseListFilters {
  projectId?: string;
  projectSlug?: string;
  resolution?: Prisma.ReleaseWhereInput['resolution'];
  kind?: Prisma.ReleaseWhereInput['kind'];
  status?: Prisma.ReleaseWhereInput['status'];
  sort?: string;
  includeUnpublished?: boolean;
}

function buildWhere(filters: ReleaseListFilters): Prisma.ReleaseWhereInput {
  // The project constraint is assembled up front rather than mutated afterwards:
  // the visibility clause and the slug filter must combine, and a later
  // assignment to `where.project` would silently drop whichever came first.
  const projectFilter: Prisma.ProjectWhereInput = {
    ...(filters.includeUnpublished ? {} : { deletedAt: null, publishStatus: 'PUBLISHED' }),
    ...(filters.projectSlug ? { slug: filters.projectSlug } : {}),
  };

  const where: Prisma.ReleaseWhereInput = {
    deletedAt: null,
    ...(filters.includeUnpublished ? {} : { status: 'PUBLISHED' }),
    ...(Object.keys(projectFilter).length > 0 ? { project: projectFilter } : {}),
  };

  if (filters.projectId) where.projectId = filters.projectId;
  if (filters.resolution) where.resolution = filters.resolution;
  if (filters.kind) where.kind = filters.kind;
  if (filters.status) where.status = filters.status;

  return where;
}

export async function listReleases(
  filters: ReleaseListFilters,
  pagination: PaginationInput = { page: 1, perPage: DEFAULT_PER_PAGE },
) {
  const where = buildWhere(filters);
  const sort = parseSort(filters.sort, RELEASE_SORTS, { field: 'releasedAt', direction: 'desc' });

  const [rows, total] = await Promise.all([
    db.release.findMany({
      where,
      ...releaseFeedArgs,
      orderBy: [toOrderBy(sort), { id: 'desc' }],
      ...toSkipTake(pagination),
    }),
    db.release.count({ where }),
  ]);

  return { items: rows.map(toFeedItem), meta: paginationMeta(total, pagination) };
}

export const listPublicReleases = cached(
  async (filtersJson: string, paginationJson: string) =>
    listReleases(
      { ...(JSON.parse(filtersJson) as ReleaseListFilters), includeUnpublished: false },
      JSON.parse(paginationJson) as PaginationInput,
    ),
  ['public-releases'],
  { tags: [CACHE_TAGS.releases], revalidate: CACHE_TTL.short },
);

export const getLatestReleases = cached(
  async (limit = 8): Promise<ReleaseFeedItem[]> => {
    const rows = await db.release.findMany({
      where: publicReleaseFilter,
      ...releaseFeedArgs,
      orderBy: [{ releasedAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    return rows.map(toFeedItem);
  },
  ['latest-releases'],
  { tags: [CACHE_TAGS.releases], revalidate: CACHE_TTL.short },
);

/**
 * Resolves a download link.
 *
 * The raw URL is never rendered into the page. The client hits this, we record
 * the event, bump the counters and hand back the target for a redirect. Two
 * benefits: accurate statistics, and the ability to retire a dead mirror without
 * anyone holding a stale direct link.
 */
export async function resolveDownload(
  linkId: string,
  context: { userId?: string | null; ipHash?: string | null; userAgent?: string | null },
): Promise<{ url: string; releaseId: string }> {
  const link = await db.downloadLink.findFirst({
    where: {
      id: linkId,
      release: { ...publicReleaseFilter },
    },
    select: {
      id: true,
      url: true,
      availability: true,
      releaseId: true,
    },
  });

  if (!link) throw new NotFoundError('A letöltési link');

  if (link.availability === 'OFFLINE') {
    throw new NotFoundError('Ez a tükör jelenleg nem elérhető, a letöltési link');
  }

  // Statistics are best-effort: a counter failure must not block the download.
  void db
    .$transaction([
      db.downloadLink.update({
        where: { id: link.id },
        data: { downloadCount: { increment: 1 } },
      }),
      db.release.update({
        where: { id: link.releaseId },
        data: { downloadCount: { increment: 1 } },
      }),
      db.downloadEvent.create({
        data: {
          releaseId: link.releaseId,
          linkId: link.id,
          userId: context.userId ?? null,
          ipHash: context.ipHash ?? null,
          userAgent: context.userAgent?.slice(0, 400) ?? null,
        },
      }),
    ])
    .catch((error) => logger.warn('Download bookkeeping failed', { error: String(error) }));

  return { url: link.url, releaseId: link.releaseId };
}

export const listReleaseFormats = cached(
  async () =>
    db.releaseFormat.findMany({
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      select: { id: true, key: true, label: true, container: true, isSoftsub: true },
    }),
  ['release-formats'],
  { tags: [CACHE_TAGS.releases], revalidate: CACHE_TTL.day },
);

export const listStorageHosts = cached(
  async () =>
    db.storageHost.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, key: true, name: true, iconUrl: true, baseUrl: true },
    }),
  ['storage-hosts'],
  { tags: [CACHE_TAGS.releases], revalidate: CACHE_TTL.day },
);

/**
 * Publishes scheduled releases whose time has come.
 *
 * Called by the cron endpoint (see `docs/runbook.md`). Doing this as a sweep
 * rather than a per-row timer keeps scheduling correct across restarts.
 */
export async function publishDueReleases(): Promise<number> {
  const due = await db.release.findMany({
    where: {
      status: 'SCHEDULED',
      deletedAt: null,
      releasedAt: { lte: new Date() },
    },
    select: { id: true, projectId: true },
  });

  if (due.length === 0) return 0;

  await db.release.updateMany({
    where: { id: { in: due.map((release) => release.id) } },
    data: { status: 'PUBLISHED' },
  });

  return due.length;
}
