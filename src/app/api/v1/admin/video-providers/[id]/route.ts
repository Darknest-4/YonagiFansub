import { defineRoute, idParams } from '@/shared/api/handler';
import { videoProviderWriteSchema } from '@/features/video/schemas';
import { deleteVideoProvider, updateVideoProvider } from '@/features/video/provider-service';
import { mutationContext } from '@/shared/api/mutation-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PUT = defineRoute({
  auth: 'settings:write',
  rateLimit: 'admin:write',
  params: idParams,
  body: videoProviderWriteSchema,
  async handler({ params, body, user, ipHash, userAgent, requestId }) {
    return updateVideoProvider(params.id, body, mutationContext(user!, { ipHash, userAgent, requestId }));
  },
});

export const DELETE = defineRoute({
  auth: 'settings:write',
  rateLimit: 'admin:write',
  params: idParams,
  async handler({ params, user, ipHash, userAgent, requestId }) {
    await deleteVideoProvider(params.id, mutationContext(user!, { ipHash, userAgent, requestId }));
    return { deleted: true };
  },
});
