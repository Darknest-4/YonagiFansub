import 'server-only';
import { Prisma } from '@prisma/client';
import { db } from '@/infrastructure/db';
import { NotFoundError, ValidationError } from '@/shared/lib/errors';
import { CACHE_TAGS, invalidate, invalidateProject } from '@/infrastructure/cache';
import { logger } from '@/infrastructure/logger';
import { notifyNewEpisode } from '@/features/notifications/service';
import type { EpisodeWriteInput } from '@/features/projects/schemas';
import { nullable, type MutationContext } from '@/shared/api/mutation-context';

/**
 * Az epizódok írási oldala.
 *
 * Ugyanaz a menet, mint a projekteknél: állapot betöltése → az átmenet
 * ellenőrzése → írás tranzakcióban → érintett cache-címkék ürítése → napló.
 * A sorrend nem esztétika: az ürítés az írás előtt versenyezne egy párhuzamos
 * olvasással, a napló az írás előtt meg nem történt változást rögzítene.
 */

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
