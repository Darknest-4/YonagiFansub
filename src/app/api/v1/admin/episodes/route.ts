import { defineRoute } from '@/lib/api/handler';
import { episodeWriteSchema } from '@/lib/validation/schemas';
import { createEpisode } from '@/server/admin/projects';
import { mutationContext } from '@/server/admin/context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  auth: 'episode:write',
  rateLimit: 'admin:write',
  body: episodeWriteSchema,
  async handler({ body, user, ipHash, userAgent, requestId }) {
    return createEpisode(body, mutationContext(user!, { ipHash, userAgent, requestId }));
  },
});
