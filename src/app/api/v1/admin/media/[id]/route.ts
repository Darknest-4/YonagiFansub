import { z } from 'zod';
import { defineRoute, idParams } from '@/shared/api/handler';
import { mutationContext } from '@/shared/api/mutation-context';
import { deleteMedia, getMediaAsset, updateMediaAlt } from '@/features/media/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  auth: 'media:write',
  rateLimit: 'api:read',
  params: idParams,
  async handler({ params }) {
    return getMediaAsset(params.id);
  },
});

export const PUT = defineRoute({
  auth: 'media:write',
  rateLimit: 'admin:write',
  params: idParams,
  body: z.object({ alt: z.string().trim().max(300).nullable().optional() }),
  async handler({ params, body, user, ipHash, userAgent, requestId }) {
    const before = await getMediaAsset(params.id);
    const after = await updateMediaAlt(params.id, body.alt ?? null);

    await mutationContext(user!, { ipHash, userAgent, requestId }).audit({
      action: 'UPDATE',
      entityType: 'MediaAsset',
      entityId: after.id,
      summary: `Médiafájl leírása módosítva: ${after.key}`,
      before: { alt: before.alt },
      after: { alt: after.alt },
    });

    return after;
  },
});

/**
 * Hard delete — there is no soft delete for media.
 *
 * A soft-deleted file would keep occupying storage while being unreachable, and
 * the thing worth recovering is not the row but the bytes, which the backup
 * holds. The audit entry records what was removed.
 */
export const DELETE = defineRoute({
  auth: 'media:delete',
  rateLimit: 'admin:write',
  params: idParams,
  async handler({ params, user, ipHash, userAgent, requestId }) {
    const asset = await deleteMedia(params.id);

    await mutationContext(user!, { ipHash, userAgent, requestId }).audit({
      action: 'DELETE',
      entityType: 'MediaAsset',
      entityId: asset.id,
      summary: `Médiafájl törölve: ${asset.key}`,
    });

    return { deleted: true, key: asset.key };
  },
});
