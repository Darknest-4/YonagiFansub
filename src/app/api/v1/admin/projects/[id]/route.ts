import { defineRoute, idParams } from '@/shared/api/handler';
import { projectWriteSchema } from '@/features/projects/schemas';
import { getAdminProject, softDeleteProject, updateProject } from '@/features/projects/admin-service';
import { mutationContext } from '@/shared/api/mutation-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  auth: 'project:read',
  rateLimit: 'api:read',
  params: idParams,
  async handler({ params }) {
    return getAdminProject(params.id);
  },
});

export const PUT = defineRoute({
  auth: 'project:write',
  rateLimit: 'admin:write',
  params: idParams,
  body: projectWriteSchema,
  async handler({ params, body, user, ipHash, userAgent, requestId }) {
    return updateProject(params.id, body, mutationContext(user!, { ipHash, userAgent, requestId }));
  },
});

export const DELETE = defineRoute({
  auth: 'project:delete',
  rateLimit: 'admin:write',
  params: idParams,
  async handler({ params, user, ipHash, userAgent, requestId }) {
    await softDeleteProject(params.id, mutationContext(user!, { ipHash, userAgent, requestId }));
    return { deleted: true };
  },
});
