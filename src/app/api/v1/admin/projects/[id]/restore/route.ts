import { defineRoute, idParams } from '@/lib/api/handler';
import { restoreProject } from '@/server/admin/projects';
import { mutationContext } from '@/server/admin/context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  auth: 'project:delete',
  rateLimit: 'admin:write',
  params: idParams,
  async handler({ params, user, ipHash, userAgent, requestId }) {
    await restoreProject(params.id, mutationContext(user!, { ipHash, userAgent, requestId }));
    return { restored: true };
  },
});
