import 'server-only';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { ConflictError, NotFoundError } from '@/lib/errors';
import { invalidateRelease } from '@/lib/cache';
import { logger } from '@/lib/logger';
import type { ReleaseWriteInput } from '@/lib/validation/schemas';
import { assertPublishAllowed, nullable, type MutationContext } from '@/server/admin/context';
import { notifyNewRelease } from '@/server/notifications';

/**
 * Release writes.
 *
 * The interesting part is link management. A release's download links are edited
 * as a set in one form, so the update reconciles three groups in a single
 * transaction: links that are new, links that changed, and links that were
 * removed. Doing it as delete-all-then-recreate would be simpler but would
 * reset every link's `downloadCount`, destroying the statistics.
 */

const adminReleaseArgs = Prisma.validator<Prisma.ReleaseDefaultArgs>()({
  select: {
    id: true,
    projectId: true,
    episodeId: true,
    kind: true,
    version: true,
    formatId: true,
    resolution: true,
    videoCodec: true,
    audioCodec: true,
    subtitleFormat: true,
    fileSizeBytes: true,
    durationSec: true,
    crc32: true,
    sha256: true,
    changelog: true,
    notes: true,
    status: true,
    releasedAt: true,
    downloadCount: true,
    createdAt: true,
    updatedAt: true,
    project: { select: { id: true, slug: true, title: true } },
    episode: { select: { id: true, number: true, title: true } },
    format: { select: { id: true, key: true, label: true } },
    links: {
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        hostId: true,
        kind: true,
        label: true,
        url: true,
        isMirror: true,
        priority: true,
        availability: true,
        downloadCount: true,
      },
    },
  },
});

export type AdminRelease = Prisma.ReleaseGetPayload<typeof adminReleaseArgs>;

export async function getAdminRelease(id: string): Promise<AdminRelease> {
  const release = await db.release.findFirst({ where: { id }, ...adminReleaseArgs });
  if (!release) throw new NotFoundError('A kiadás');
  return release;
}

function toReleaseData(input: ReleaseWriteInput) {
  return {
    kind: input.kind,
    version: input.version,
    resolution: input.resolution,
    videoCodec: nullable(input.videoCodec),
    audioCodec: nullable(input.audioCodec),
    subtitleFormat: nullable(input.subtitleFormat),
    fileSizeBytes: input.fileSizeBytes ?? null,
    durationSec: nullable(input.durationSec),
    crc32: input.crc32 ? input.crc32.toUpperCase() : null,
    sha256: input.sha256 ? input.sha256.toLowerCase() : null,
    changelog: nullable(input.changelog),
    notes: nullable(input.notes),
    status: input.status,
  };
}

function resolveReleasedAt(
  input: ReleaseWriteInput,
  current?: { releasedAt: Date | null },
): Date | null {
  if (input.releasedAt) return input.releasedAt;
  if (input.status === 'PUBLISHED') return current?.releasedAt ?? new Date();
  return current?.releasedAt ?? null;
}

async function assertNoDuplicate(
  input: ReleaseWriteInput,
  excludeId?: string,
): Promise<void> {
  if (!input.episodeId) return;

  const clash = await db.release.findFirst({
    where: {
      episodeId: input.episodeId,
      formatId: input.formatId ?? null,
      resolution: input.resolution,
      version: input.version,
      deletedAt: null,
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
    },
    select: { id: true },
  });

  if (clash) {
    throw new ConflictError(
      'Ehhez az epizódhoz már létezik kiadás ezzel a formátummal, felbontással és verzióval. Emeld a verziószámot.',
    );
  }
}

export async function createRelease(
  input: ReleaseWriteInput,
  context: MutationContext,
): Promise<AdminRelease> {
  assertPublishAllowed(context, 'release:publish', input.status);

  const project = await db.project.findFirst({
    where: { id: input.projectId, deletedAt: null },
    select: { id: true, slug: true, title: true },
  });
  if (!project) throw new NotFoundError('A projekt');

  await assertNoDuplicate(input);

  const release = await db.release.create({
    data: {
      ...toReleaseData(input),
      projectId: project.id,
      episodeId: nullable(input.episodeId),
      formatId: nullable(input.formatId),
      releasedAt: resolveReleasedAt(input),
      createdById: context.actor.id,
      links: {
        create: input.links.map((link) => ({
          hostId: nullable(link.hostId),
          kind: link.kind,
          label: nullable(link.label),
          url: link.url,
          isMirror: link.isMirror,
          priority: link.priority,
          availability: link.availability,
        })),
      },
    },
    ...adminReleaseArgs,
  });

  invalidateRelease(project.slug, release.id);

  await context.audit({
    action: 'CREATE',
    entityType: 'Release',
    entityId: release.id,
    summary: `Kiadás létrehozva: ${project.title} v${input.version}`,
    after: toReleaseData(input),
  });

  // Followers are only told about something they can actually download.
  if (release.status === 'PUBLISHED') {
    void notifyNewRelease(release.id).catch((error) =>
      logger.error('Release notification failed', error, { releaseId: release.id }),
    );
  }

  return release;
}

export async function updateRelease(
  id: string,
  input: ReleaseWriteInput,
  context: MutationContext,
): Promise<AdminRelease> {
  const current = await getAdminRelease(id);
  assertPublishAllowed(context, 'release:publish', input.status, current.status);
  await assertNoDuplicate(input, id);

  const wasPublished = current.status === 'PUBLISHED';

  const release = await db.$transaction(async (tx) => {
    const keptIds = input.links
      .map((link) => link.id)
      .filter((linkId): linkId is string => Boolean(linkId));

    // Links the editor removed from the form.
    await tx.downloadLink.deleteMany({
      where: { releaseId: id, ...(keptIds.length ? { NOT: { id: { in: keptIds } } } : {}) },
    });

    for (const link of input.links) {
      const data = {
        hostId: nullable(link.hostId),
        kind: link.kind,
        label: nullable(link.label),
        url: link.url,
        isMirror: link.isMirror,
        priority: link.priority,
        availability: link.availability,
      };

      if (link.id) {
        // Update by id *and* releaseId: an id from another release must not be
        // reassignable by editing the form payload.
        await tx.downloadLink.updateMany({ where: { id: link.id, releaseId: id }, data });
      } else {
        await tx.downloadLink.create({ data: { ...data, releaseId: id } });
      }
    }

    return tx.release.update({
      where: { id },
      data: {
        ...toReleaseData(input),
        episodeId: nullable(input.episodeId),
        formatId: nullable(input.formatId),
        releasedAt: resolveReleasedAt(input, current),
      },
      ...adminReleaseArgs,
    });
  });

  invalidateRelease(current.project.slug, id);

  await context.audit({
    action: 'UPDATE',
    entityType: 'Release',
    entityId: id,
    summary: `Kiadás módosítva: ${current.project.title} v${input.version}`,
    before: toReleaseData({ ...current, links: [] } as unknown as ReleaseWriteInput),
    after: toReleaseData(input),
  });

  // Notify only on the draft → published transition, never on a later edit.
  if (!wasPublished && release.status === 'PUBLISHED') {
    void notifyNewRelease(release.id).catch((error) =>
      logger.error('Release notification failed', error, { releaseId: release.id }),
    );
  }

  return release;
}

export async function softDeleteRelease(id: string, context: MutationContext): Promise<void> {
  const release = await getAdminRelease(id);

  await db.release.update({ where: { id }, data: { deletedAt: new Date(), status: 'ARCHIVED' } });
  invalidateRelease(release.project.slug, id);

  await context.audit({
    action: 'DELETE',
    entityType: 'Release',
    entityId: id,
    summary: `Kiadás törölve: ${release.project.title} v${release.version}`,
  });
}

/** Bulk publish from the admin table's selection toolbar. */
export async function publishReleases(
  ids: string[],
  context: MutationContext,
): Promise<{ published: number }> {
  const releases = await db.release.findMany({
    where: { id: { in: ids }, deletedAt: null, status: { not: 'PUBLISHED' } },
    select: { id: true, version: true, project: { select: { slug: true, title: true } } },
  });

  if (releases.length === 0) return { published: 0 };

  const now = new Date();
  await db.release.updateMany({
    where: { id: { in: releases.map((release) => release.id) } },
    data: { status: 'PUBLISHED', releasedAt: now },
  });

  for (const release of releases) {
    invalidateRelease(release.project.slug, release.id);
    void notifyNewRelease(release.id).catch(() => undefined);
  }

  await context.audit({
    action: 'UPDATE',
    entityType: 'Release',
    summary: `${releases.length} kiadás publikálva`,
    after: { ids: releases.map((release) => release.id) },
  });

  return { published: releases.length };
}
