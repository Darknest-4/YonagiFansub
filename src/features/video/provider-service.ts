import 'server-only';
import { db } from '@/infrastructure/db';
import { ConflictError, NotFoundError } from '@/shared/lib/errors';
import { nullable, type MutationContext } from '@/shared/api/mutation-context';
import type { VideoProviderWriteInput } from '@/lib/validation/schemas';

/**
 * Video provider registry.
 *
 * A table rather than a constant because the set of working filehosts changes
 * faster than anyone deploys. Adding one is a row; a host going bad is a
 * checkbox, and `isEnabled: false` takes every source it serves offline at once
 * — which is the actual emergency response, not editing sources one by one.
 */

const providerSelect = {
  id: true,
  slug: true,
  name: true,
  kind: true,
  embedTemplate: true,
  urlPatterns: true,
  domains: true,
  allowPopups: true,
  isEnabled: true,
  sortOrder: true,
  color: true,
  notes: true,
  _count: { select: { sources: true } },
} as const;

export async function listVideoProviders() {
  return db.videoProvider.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: providerSelect,
  });
}

/** Enabled providers only, for the source form's dropdown. */
export async function listUsableProviders() {
  return db.videoProvider.findMany({
    where: { isEnabled: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, slug: true, name: true, kind: true, domains: true, color: true },
  });
}

export async function createVideoProvider(
  input: VideoProviderWriteInput,
  context: MutationContext,
) {
  const clash = await db.videoProvider.findUnique({
    where: { slug: input.slug },
    select: { id: true },
  });
  if (clash) throw new ConflictError('Ez a slug már foglalt.');

  const provider = await db.videoProvider.create({
    data: {
      slug: input.slug,
      name: input.name,
      kind: input.kind,
      embedTemplate: nullable(input.embedTemplate ?? null),
      urlPatterns: input.urlPatterns,
      domains: input.domains,
      allowPopups: input.allowPopups,
      isEnabled: input.isEnabled,
      sortOrder: input.sortOrder,
      color: nullable(input.color ?? null),
      notes: nullable(input.notes),
    },
    select: { id: true, slug: true, name: true },
  });

  await context.audit({
    action: 'CREATE',
    entityType: 'VideoProvider',
    entityId: provider.id,
    summary: `Videó-szolgáltató hozzáadva: ${provider.name}`,
    after: { slug: input.slug, kind: input.kind, domains: input.domains },
  });

  return provider;
}

export async function updateVideoProvider(
  id: string,
  input: VideoProviderWriteInput,
  context: MutationContext,
) {
  const current = await db.videoProvider.findUnique({
    where: { id },
    select: { id: true, slug: true, name: true, isEnabled: true, domains: true },
  });
  if (!current) throw new NotFoundError('A szolgáltató');

  if (input.slug !== current.slug) {
    const clash = await db.videoProvider.findUnique({
      where: { slug: input.slug },
      select: { id: true },
    });
    if (clash) throw new ConflictError('Ez a slug már foglalt.');
  }

  const provider = await db.videoProvider.update({
    where: { id },
    data: {
      slug: input.slug,
      name: input.name,
      kind: input.kind,
      embedTemplate: nullable(input.embedTemplate ?? null),
      urlPatterns: input.urlPatterns,
      domains: input.domains,
      allowPopups: input.allowPopups,
      isEnabled: input.isEnabled,
      sortOrder: input.sortOrder,
      color: nullable(input.color ?? null),
      notes: nullable(input.notes),
    },
    select: { id: true, slug: true, name: true },
  });

  await context.audit({
    action: 'UPDATE',
    entityType: 'VideoProvider',
    entityId: id,
    summary: `Videó-szolgáltató módosítva: ${provider.name}`,
    before: { isEnabled: current.isEnabled, domains: current.domains },
    after: { isEnabled: input.isEnabled, domains: input.domains },
  });

  return provider;
}

export async function deleteVideoProvider(id: string, context: MutationContext): Promise<void> {
  const provider = await db.videoProvider.findUnique({
    where: { id },
    select: { id: true, name: true, _count: { select: { sources: true } } },
  });
  if (!provider) throw new NotFoundError('A szolgáltató');

  // Deleting would orphan its sources into an unplayable state. Disabling is
  // the reversible way to take a bad host offline, and it is what people
  // actually want when they reach for delete.
  if (provider._count.sources > 0) {
    throw new ConflictError(
      `${provider._count.sources} forrás használja. Kapcsold ki helyette — azzal minden forrása azonnal offline lesz, és később visszakapcsolható.`,
    );
  }

  await db.videoProvider.delete({ where: { id } });

  await context.audit({
    action: 'DELETE',
    entityType: 'VideoProvider',
    entityId: id,
    summary: `Videó-szolgáltató törölve: ${provider.name}`,
  });
}
