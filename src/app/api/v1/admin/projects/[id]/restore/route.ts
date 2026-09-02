import { defineRoute, idParams } from '@/shared/api/handler';
import { restoreProject } from '@/features/projects/admin-service';
import { mutationContext } from '@/shared/api/mutation-context';

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
