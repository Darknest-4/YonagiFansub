import 'server-only';
import { db } from '@/lib/db';
import { ConflictError, NotFoundError } from '@/lib/errors';
import { invalidateProject } from '@/lib/cache';
import type { VideoWriteInput } from '@/lib/validation/schemas';
import { nullable, type MutationContext } from '@/server/admin/context';

/**
 * Video source administration.
 *
 * A source is a pointer into media storage, never a URL. That is the whole
 * reason protected playback is possible: if this held a public URL, the URL
 * would eventually be rendered somewhere and the protection would be theatre.
 */

async function episodeOf(episodeId: string) {
  const episode = await db.episode.findFirst({
    where: { id: episodeId, deletedAt: null },
    select: { id: true, project: { select: { slug: true } } },
  });
  if (!episode) throw new NotFoundError('Az epizód');
  return episode;
}

export async function listEpisodeVideosAdmin(episodeId: string) {
  return db.videoSource.findMany({
    where: { episodeId, deletedAt: null },
    orderBy: [{ createdAt: 'asc' }],
    select: {
      id: true,
      masterKey: true,
      label: true,
      resolution: true,
      durationSec: true,
      requiresAuth: true,
      status: true,
      viewCount: true,
      createdAt: true,
    },
  });
}

export async function createVideoSource(
  input: VideoWriteInput,
  context: MutationContext,
) {
  const episode = await episodeOf(input.episodeId);

  const clash = await db.videoSource.findFirst({
    where: { episodeId: input.episodeId, masterKey: input.masterKey, deletedAt: null },
    select: { id: true },
  });
  if (clash) throw new ConflictError('Ehhez az epizódhoz már tartozik ez a forrás.');

  const video = await db.videoSource.create({
    data: {
      episodeId: input.episodeId,
      masterKey: input.masterKey,
      label: nullable(input.label),
      resolution: input.resolution,
      durationSec: input.durationSec ?? null,
      requiresAuth: input.requiresAuth,
      status: input.status,
      createdById: context.actor.id,
    },
    select: { id: true, masterKey: true, status: true },
  });

  invalidateProject(episode.project.slug);

  await context.audit({
    action: 'CREATE',
    entityType: 'VideoSource',
    entityId: video.id,
    summary: `Videóforrás hozzáadva: ${input.masterKey}`,
    after: { masterKey: input.masterKey, status: input.status },
  });

  return video;
}

export async function updateVideoSource(
  id: string,
  input: VideoWriteInput,
  context: MutationContext,
) {
  const current = await db.videoSource.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, status: true, masterKey: true, episode: { select: { project: { select: { slug: true } } } } },
  });
  if (!current) throw new NotFoundError('A videóforrás');

  const video = await db.videoSource.update({
    where: { id },
    data: {
      masterKey: input.masterKey,
      label: nullable(input.label),
      resolution: input.resolution,
      durationSec: input.durationSec ?? null,
      requiresAuth: input.requiresAuth,
      status: input.status,
    },
    select: { id: true, masterKey: true, status: true },
  });

  invalidateProject(current.episode.project.slug);

  await context.audit({
    action: 'UPDATE',
    entityType: 'VideoSource',
    entityId: id,
    summary: `Videóforrás módosítva: ${input.masterKey}`,
    before: { masterKey: current.masterKey, status: current.status },
    after: { masterKey: input.masterKey, status: input.status },
  });

  return video;
}

export async function deleteVideoSource(id: string, context: MutationContext): Promise<void> {
  const current = await db.videoSource.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, masterKey: true, episode: { select: { project: { select: { slug: true } } } } },
  });
  if (!current) throw new NotFoundError('A videóforrás');

  // Soft delete: the stored package is untouched, so an accidental removal is
  // recoverable and no viewer's storage is deleted by an admin misclick.
  await db.videoSource.update({
    where: { id },
    data: { deletedAt: new Date(), status: 'ARCHIVED' },
  });

  invalidateProject(current.episode.project.slug);

  await context.audit({
    action: 'DELETE',
    entityType: 'VideoSource',
    entityId: id,
    summary: `Videóforrás eltávolítva: ${current.masterKey}`,
  });
}
