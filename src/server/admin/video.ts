import 'server-only';
import { db } from '@/lib/db';
import { ConflictError, NotFoundError } from '@/lib/errors';
import { invalidateProject } from '@/lib/cache';
import type { VideoWriteInput } from '@/lib/validation/schemas';
import { extractExternalId } from '@/lib/video/provider';
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
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      kind: true,
      masterKey: true,
      externalId: true,
      sourceUrl: true,
      providerId: true,
      proxied: true,
      allowPopups: true,
      sortOrder: true,
      label: true,
      resolution: true,
      durationSec: true,
      requiresAuth: true,
      status: true,
      viewCount: true,
      createdAt: true,
      provider: { select: { id: true, name: true, slug: true } },
    },
  });
}

/**
 * Normalises the kind-specific fields, and turns a pasted page URL into the
 * provider's file id.
 *
 * The extraction happens on write rather than on read so the stored value is
 * always an id: a source saved from a URL keeps working after the provider
 * changes its page layout, and the failure — if the URL does not match any
 * pattern — surfaces while somebody is looking at the form.
 */
async function toSourceData(input: VideoWriteInput) {
  const base = {
    kind: input.kind,
    label: nullable(input.label),
    resolution: input.resolution,
    durationSec: input.durationSec ?? null,
    requiresAuth: input.requiresAuth,
    proxied: input.proxied,
    allowPopups: input.allowPopups ?? null,
    sortOrder: input.sortOrder,
    status: input.status,
  };

  if (input.kind === 'HLS_PROXY') {
    return {
      ...base,
      masterKey: input.masterKey ?? null,
      providerId: null,
      externalId: null,
      sourceUrl: null,
      // Own storage is always served through the proxy; the flag is meaningless
      // here and leaving it set would be a lie in the admin list.
      proxied: true,
    };
  }

  if (input.kind === 'DIRECT_FILE') {
    return {
      ...base,
      masterKey: null,
      providerId: input.providerId ?? null,
      externalId: null,
      sourceUrl: input.sourceUrl ?? null,
    };
  }

  const provider = await db.videoProvider.findUnique({
    where: { id: input.providerId as string },
    select: { id: true, slug: true, embedTemplate: true, urlPatterns: true, domains: true },
  });
  if (!provider) throw new NotFoundError('A szolgáltató');

  const externalId = extractExternalId(provider, input.externalId ?? '');
  if (!externalId) {
    throw new ConflictError(
      `Ebből nem sikerült azonosítót kinyerni. Ellenőrizd, hogy tényleg ${provider.slug} link-e, vagy írd be közvetlenül az azonosítót.`,
    );
  }

  return {
    ...base,
    masterKey: null,
    providerId: provider.id,
    externalId,
    sourceUrl: null,
    // An embed is served by the provider; nothing to proxy.
    proxied: false,
  };
}

export async function createVideoSource(
  input: VideoWriteInput,
  context: MutationContext,
) {
  const episode = await episodeOf(input.episodeId);
  const data = await toSourceData(input);

  const clash = await db.videoSource.findFirst({
    where: {
      episodeId: input.episodeId,
      deletedAt: null,
      ...(data.masterKey
        ? { masterKey: data.masterKey }
        : data.sourceUrl
          ? { sourceUrl: data.sourceUrl }
          : { providerId: data.providerId, externalId: data.externalId }),
    },
    select: { id: true },
  });
  if (clash) throw new ConflictError('Ehhez az epizódhoz már tartozik ez a forrás.');

  const video = await db.videoSource.create({
    data: { episodeId: input.episodeId, ...data, createdById: context.actor.id },
    select: { id: true, kind: true, status: true },
  });

  invalidateProject(episode.project.slug);

  await context.audit({
    action: 'CREATE',
    entityType: 'VideoSource',
    entityId: video.id,
    summary: `Videóforrás hozzáadva: ${describeSource(data)}`,
    after: { kind: data.kind, status: input.status },
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
    select: {
      id: true,
      status: true,
      kind: true,
      masterKey: true,
      episode: { select: { project: { select: { slug: true } } } },
    },
  });
  if (!current) throw new NotFoundError('A videóforrás');

  const data = await toSourceData(input);

  const video = await db.videoSource.update({
    where: { id },
    data,
    select: { id: true, kind: true, status: true },
  });

  invalidateProject(current.episode.project.slug);

  await context.audit({
    action: 'UPDATE',
    entityType: 'VideoSource',
    entityId: id,
    summary: `Videóforrás módosítva: ${describeSource(data)}`,
    before: { kind: current.kind, status: current.status },
    after: { kind: data.kind, status: input.status },
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
    summary: `Videóforrás eltávolítva: ${current.masterKey ?? current.id}`,
  });
}

/** A short, human line for the audit log. */
function describeSource(data: { kind: string; masterKey: string | null; sourceUrl: string | null; externalId: string | null }): string {
  if (data.masterKey) return data.masterKey;
  if (data.sourceUrl) return data.sourceUrl.slice(0, 120);
  return `${data.kind} ${data.externalId ?? ''}`.trim();
}
