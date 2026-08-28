import { defineRoute, idParams } from '@/lib/api/handler';
import { videoWriteSchema } from '@/lib/validation/schemas';
import { deleteVideoSource, updateVideoSource } from '@/server/admin/video';
import { mutationContext } from '@/server/admin/context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PUT = defineRoute({
  auth: 'episode:write',
  rateLimit: 'admin:write',
  params: idParams,
  body: videoWriteSchema,
  async handler({ params, body, user, ipHash, userAgent, requestId }) {
    return updateVideoSource(params.id, body, mutationContext(user!, { ipHash, userAgent, requestId }));
  },
});

export const DELETE = defineRoute({
  auth: 'episode:delete',
  rateLimit: 'admin:write',
  params: idParams,
  async handler({ params, user, ipHash, userAgent, requestId }) {
    await deleteVideoSource(params.id, mutationContext(user!, { ipHash, userAgent, requestId }));
    return { deleted: true };
  },
});
