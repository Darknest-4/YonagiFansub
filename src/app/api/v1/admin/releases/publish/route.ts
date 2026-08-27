import { z } from 'zod';
import { defineRoute } from '@/lib/api/handler';
import { publishReleases } from '@/server/admin/releases';
import { mutationContext } from '@/server/admin/context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Bulk publish from the admin table's selection toolbar. */
export const POST = defineRoute({
  auth: 'release:publish',
  rateLimit: 'admin:write',
  body: z.object({ ids: z.array(z.string().cuid()).min(1).max(100) }),
  async handler({ body, user, ipHash, userAgent, requestId }) {
    return publishReleases(body.ids, mutationContext(user!, { ipHash, userAgent, requestId }));
  },
});
