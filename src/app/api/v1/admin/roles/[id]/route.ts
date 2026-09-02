import { defineRoute, idParams } from '@/shared/api/handler';
import { roleWriteSchema } from '@/features/users/schemas';
import { deleteRole, upsertRole } from '@/features/users/admin-service';
import { mutationContext } from '@/shared/api/mutation-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PUT = defineRoute({
  auth: 'role:manage',
  rateLimit: 'admin:write',
  params: idParams,
  body: roleWriteSchema,
  async handler({ params, body, user, ipHash, userAgent, requestId }) {
    return upsertRole(params.id, body, mutationContext(user!, { ipHash, userAgent, requestId }));
  },
});

export const DELETE = defineRoute({
  auth: 'role:manage',
  rateLimit: 'admin:write',
  params: idParams,
  async handler({ params, user, ipHash, userAgent, requestId }) {
    await deleteRole(params.id, mutationContext(user!, { ipHash, userAgent, requestId }));
    return { deleted: true };
  },
});
