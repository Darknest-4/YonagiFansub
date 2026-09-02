import { defineRoute, idParams } from '@/shared/api/handler';
import { episodeWriteSchema } from '@/features/projects/schemas';
import { softDeleteEpisode, updateEpisode } from '@/features/projects/episode-admin-service';
import { mutationContext } from '@/shared/api/mutation-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PUT = defineRoute({
  auth: 'episode:write',
  rateLimit: 'admin:write',
  params: idParams,
  body: episodeWriteSchema,
  async handler({ params, body, user, ipHash, userAgent, requestId }) {
    return updateEpisode(params.id, body, mutationContext(user!, { ipHash, userAgent, requestId }));
  },
});

export const DELETE = defineRoute({
  auth: 'episode:delete',
  rateLimit: 'admin:write',
  params: idParams,
  async handler({ params, user, ipHash, userAgent, requestId }) {
    await softDeleteEpisode(params.id, mutationContext(user!, { ipHash, userAgent, requestId }));
    return { deleted: true };
  },
});
