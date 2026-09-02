import 'server-only';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { CACHE_TAGS, invalidate, invalidateProject } from '@/lib/cache';
import { logger } from '@/lib/logger';
import { notifyNewEpisode, notifyProjectStatusChange } from '@/server/notifications';
import type { ProjectWriteInput, EpisodeWriteInput } from '@/lib/validation/schemas';
import { assertPublishAllowed, nullable, type MutationContext } from '@/server/admin/context';

/**
 * Project and episode writes.
 *
 * Every mutation follows the same shape:
 *   load current state → validate the transition → write in a transaction →
 *   invalidate the affected cache tags → append to the audit trail.
 *
 * The order matters. Invalidating before the write would race with a concurrent
 * read; auditing before the write would record changes that did not happen.
 */

const adminProjectArgs = Prisma.validator<Prisma.ProjectDefaultArgs>()({
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
    deletedAt: true,
    genres: { select: { genreId: true, genre: { select: { name: true, slug: true } } } },
    _count: { select: { episodes: true } },
  },
});

export type AdminProject = Prisma.ProjectGetPayload<typeof adminProjectArgs>;

export async function getAdminProject(id: string): Promise<AdminProject> {
  const project = await db.project.findFirst({ where: { id }, ...adminProjectArgs });
  if (!project) throw new NotFoundError('A projekt');
  return project;
}

function toProjectData(input: ProjectWriteInput) {
  return {
    slug: input.slug,
    title: input.title,
    titleRomaji: nullable(input.titleRomaji),
    titleNative: nullable(input.titleNative),
    titleEnglish: nullable(input.titleEnglish),
    synonyms: input.synonyms,
    synopsis: nullable(input.synopsis),
    type: input.type,
    status: input.status,
    publishStatus: input.publishStatus,
    season: nullable(input.season),
    seasonYear: nullable(input.seasonYear),
    totalEpisodes: nullable(input.totalEpisodes),
    ageRating: nullable(input.ageRating),
    studio: nullable(input.studio),
    source: nullable(input.source),
    durationMin: nullable(input.durationMin),
    coverImageUrl: nullable(input.coverImageUrl),
    bannerImageUrl: nullable(input.bannerImageUrl),
    trailerUrl: nullable(input.trailerUrl),
    accentColor: nullable(input.accentColor),
    malId: nullable(input.malId),
    anilistId: nullable(input.anilistId),
    isFeatured: input.isFeatured,
  };
}

/**
 * Publishing requires a timestamp. Rather than rejecting the form for a field
 * the editor has no reason to think about, we fill it in — but never overwrite
 * a date they set deliberately.
 */
function resolvePublishedAt(
  input: ProjectWriteInput,
  current?: { publishedAt: Date | null },
): Date | null {
  if (input.publishedAt) return input.publishedAt;
  if (input.publishStatus === 'PUBLISHED') return current?.publishedAt ?? new Date();
  return current?.publishedAt ?? null;
}

export async function createProject(
  input: ProjectWriteInput,
  context: MutationContext,
): Promise<AdminProject> {
  assertPublishAllowed(context, 'project:publish', input.publishStatus);

  const existing = await db.project.findUnique({ where: { slug: input.slug }, select: { id: true } });
  if (existing) throw new ConflictError('Ez a slug már foglalt.');

  const project = await db.project.create({
    data: {
      ...toProjectData(input),
      publishedAt: resolvePublishedAt(input),
      createdById: context.actor.id,
      genres: { create: input.genreIds.map((genreId) => ({ genreId })) },
    },
    ...adminProjectArgs,
  });

  invalidateProject(project.slug);

  await context.audit({
    action: 'CREATE',
    entityType: 'Project',
    entityId: project.id,
    summary: `Projekt létrehozva: ${project.title}`,
    after: toProjectData(input),
  });

  return project;
}

export async function updateProject(
  id: string,
  input: ProjectWriteInput,
  context: MutationContext,
): Promise<AdminProject> {
  const current = await getAdminProject(id);
  assertPublishAllowed(context, 'project:publish', input.publishStatus, current.publishStatus);

  if (input.slug !== current.slug) {
    const clash = await db.project.findUnique({ where: { slug: input.slug }, select: { id: true } });
    if (clash) throw new ConflictError('Ez a slug már foglalt.');
  }

  const project = await db.$transaction(async (tx) => {
    // Genres are replaced wholesale rather than diffed: the join table has no
    // payload of its own, so a delete-then-create is both simpler and atomic.
    await tx.projectGenre.deleteMany({ where: { projectId: id } });

    return tx.project.update({
      where: { id },
      data: {
        ...toProjectData(input),
        publishedAt: resolvePublishedAt(input, current),
        genres: { create: input.genreIds.map((genreId) => ({ genreId })) },
      },
      ...adminProjectArgs,
    });
  });

  // The old slug must be invalidated too, or its cached page survives a rename.
  invalidateProject(current.slug);
  invalidateProject(project.slug);

  /*
    "Is there a second season, and did they drop it?" is the question followers
    actually have, and until now the only way to answer it was to keep checking
    the page. A status change is the one project edit worth telling people
    about — a synopsis fix is not.

    Detached, like the release fan-out: a follower list should never be able to
    make the editor's save time out.
  */
  if (current.status !== input.status) {
    void notifyProjectStatusChange(id, input.status).catch((error) =>
      logger.error('Projektállapot-értesítés nem sikerült', error, { projectId: id }),
    );
  }

  await context.audit({
    action: 'UPDATE',
    entityType: 'Project',
    entityId: id,
    summary: `Projekt módosítva: ${project.title}`,
    before: toProjectData({ ...current, genreIds: [] } as unknown as ProjectWriteInput),
    after: toProjectData(input),
  });

  return project;
}

/**
 * Soft delete.
 *
 * Projects are referenced by releases, credits, favourites and the audit trail;
 * a hard delete would either cascade far too widely or leave orphans. Setting
 * `deletedAt` removes it from every query path while keeping history intact.
 */
export async function softDeleteProject(id: string, context: MutationContext): Promise<void> {
  const project = await getAdminProject(id);

  await db.project.update({
    where: { id },
    data: { deletedAt: new Date(), publishStatus: 'ARCHIVED', isFeatured: false },
  });

  invalidateProject(project.slug);

  await context.audit({
    action: 'DELETE',
    entityType: 'Project',
    entityId: id,
    summary: `Projekt törölve: ${project.title}`,
  });
}

export async function restoreProject(id: string, context: MutationContext): Promise<void> {
  const project = await db.project.findFirst({
    where: { id, deletedAt: { not: null } },
    select: { id: true, slug: true, title: true },
  });
  if (!project) throw new NotFoundError('A törölt projekt');

  await db.project.update({ where: { id }, data: { deletedAt: null } });
  invalidateProject(project.slug);

  await context.audit({
    action: 'RESTORE',
    entityType: 'Project',
    entityId: id,
    summary: `Projekt visszaállítva: ${project.title}`,
  });
}

// ── Episodes ─────────────────────────────────────────────────────────────────

function toEpisodeData(input: EpisodeWriteInput) {
  return {
    number: new Prisma.Decimal(input.number),
    title: nullable(input.title),
    titleNative: nullable(input.titleNative),
    synopsis: nullable(input.synopsis),
    thumbnailUrl: nullable(input.thumbnailUrl),
    durationSec: nullable(input.durationSec),
    airedAt: nullable(input.airedAt),
    status: input.status,
    progressTranslation: input.progressTranslation,
    progressTiming: input.progressTiming,
    progressTypesetting: input.progressTypesetting,
    progressEditing: input.progressEditing,
    progressEncoding: input.progressEncoding,
    progressQc: input.progressQc,
  };
}

/**
 * One episode, by the pair a person actually knows: project slug and episode
 * number.
 *
 * Every other admin path reaches an episode through a screen that already has
 * its id. A script does not — `npm run hls` is invoked with a filename and a
 * storage key, and asking an encoder to copy a cuid out of a browser URL is
 * exactly the manual step the auto-registration exists to remove.
 *
 * Returns the episode's existing sources too, so a caller can tell "this
 * package is already registered" from "this episode has nothing".
 */
export async function lookupEpisode(projectSlug: string, number: number) {
  return db.episode.findFirst({
    where: {
      deletedAt: null,
      number: new Prisma.Decimal(number),
      project: { slug: projectSlug, deletedAt: null },
    },
    select: {
      id: true,
      number: true,
      title: true,
      durationSec: true,
      status: true,
      project: { select: { id: true, slug: true, title: true } },
      videos: {
        where: { deletedAt: null },
        select: { id: true, kind: true, masterKey: true, label: true, status: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });
}

export async function createEpisode(input: EpisodeWriteInput, context: MutationContext) {
  const project = await db.project.findFirst({
    where: { id: input.projectId, deletedAt: null },
    select: { id: true, slug: true, title: true },
  });
  if (!project) throw new NotFoundError('A projekt');

  const clash = await db.episode.findFirst({
    where: { projectId: project.id, number: new Prisma.Decimal(input.number) },
    select: { id: true },
  });
  if (clash) {
    throw new ValidationError({ number: ['Ehhez a projekthez már létezik ilyen sorszámú epizód.'] });
  }

  const episode = await db.episode.create({
    data: { ...toEpisodeData(input), projectId: project.id },
  });

  invalidateProject(project.slug);
  invalidate(CACHE_TAGS.episodes(project.id));

  await context.audit({
    action: 'CREATE',
    entityType: 'Episode',
    entityId: episode.id,
    summary: `Epizód létrehozva: ${project.title} – ${input.number}. rész`,
    after: toEpisodeData(input),
  });

  return episode;
}

export async function updateEpisode(
  id: string,
  input: EpisodeWriteInput,
  context: MutationContext,
) {
  const current = await db.episode.findFirst({
    where: { id, deletedAt: null },
    include: { project: { select: { id: true, slug: true, title: true } } },
  });
  if (!current) throw new NotFoundError('Az epizód');

  if (!current.number.equals(new Prisma.Decimal(input.number))) {
    const clash = await db.episode.findFirst({
      where: {
        projectId: current.projectId,
        number: new Prisma.Decimal(input.number),
        NOT: { id },
      },
      select: { id: true },
    });
    if (clash) {
      throw new ValidationError({ number: ['Ehhez a projekthez már létezik ilyen sorszámú epizód.'] });
    }
  }

  /*
    Publication is a moment, and it happens here now.

    `releasedAt` used to come from the release row; with that gone, the episode
    itself has to record when it went out. It is stamped on the transition into
    RELEASED and never re-stamped: a later edit to a published episode — a typo
    in the title, a corrected progress bar — must not move it to today and drag
    the episode back to the top of the feed.

    A move *out* of RELEASED clears it, so an episode pulled back for a fix does
    not keep claiming a release date it no longer has.
  */
  const becamePublished = input.status === 'RELEASED' && current.status !== 'RELEASED';
  const data = toEpisodeData(input);

  const episode = await db.episode.update({
    where: { id },
    data: {
      ...data,
      ...(becamePublished ? { releasedAt: current.releasedAt ?? new Date() } : {}),
      ...(input.status !== 'RELEASED' ? { releasedAt: null } : {}),
    },
  });

  invalidateProject(current.project.slug);
  invalidate(CACHE_TAGS.episodes(current.projectId));

  // Fire-and-forget: a follower fan-out must never fail the edit that caused it.
  if (becamePublished) {
    void notifyNewEpisode(id).catch((error) =>
      logger.error('Epizód-értesítés kiküldése nem sikerült', error, { episodeId: id }),
    );
  }

  await context.audit({
    action: 'UPDATE',
    entityType: 'Episode',
    entityId: id,
    summary: `Epizód módosítva: ${current.project.title} – ${input.number}. rész`,
    before: {
      status: current.status,
      progressTranslation: current.progressTranslation,
      progressTiming: current.progressTiming,
      progressTypesetting: current.progressTypesetting,
      progressEditing: current.progressEditing,
      progressEncoding: current.progressEncoding,
      progressQc: current.progressQc,
    },
    after: toEpisodeData(input),
  });

  return episode;
}

export async function softDeleteEpisode(id: string, context: MutationContext): Promise<void> {
  const episode = await db.episode.findFirst({
    where: { id, deletedAt: null },
    include: { project: { select: { id: true, slug: true, title: true } } },
  });
  if (!episode) throw new NotFoundError('Az epizód');

  await db.episode.update({ where: { id }, data: { deletedAt: new Date() } });

  invalidateProject(episode.project.slug);
  invalidate(CACHE_TAGS.episodes(episode.projectId));

  await context.audit({
    action: 'DELETE',
    entityType: 'Episode',
    entityId: id,
    summary: `Epizód törölve: ${episode.project.title} – ${episode.number}. rész`,
  });
}
