import { defineRoute, idParams } from '@/lib/api/handler';
import { findMediaReferences, getMediaAsset } from '@/server/media';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * What still points at this file.
 *
 * Its own endpoint rather than a field on the asset, because it costs five
 * queries and the media grid renders dozens of assets at a time. Nobody needs
 * the answer until they are about to delete one, so it is fetched then.
 */
export const GET = defineRoute({
  auth: 'media:write',
  rateLimit: 'api:read',
  params: idParams,
  async handler({ params }) {
    const asset = await getMediaAsset(params.id);
    return { references: await findMediaReferences(asset.key) };
  },
});
