import { z } from 'zod';
import { defineRoute } from '@/shared/api/handler';
import { videoWriteSchema } from '@/lib/validation/schemas';
import { createVideoSource, listEpisodeVideosAdmin } from '@/features/video/admin-service';
import { mutationContext } from '@/shared/api/mutation-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  auth: 'episode:write',
  rateLimit: 'api:read',
  query: z.object({ episodeId: z.string().min(1) }),
  async handler({ query }) {
    return listEpisodeVideosAdmin(query.episodeId);
  },
});

export const POST = defineRoute({
  auth: 'episode:write',
  rateLimit: 'admin:write',
  body: videoWriteSchema,
  async handler({ body, user, ipHash, userAgent, requestId }) {
    return createVideoSource(body, mutationContext(user!, { ipHash, userAgent, requestId }));
  },
});
