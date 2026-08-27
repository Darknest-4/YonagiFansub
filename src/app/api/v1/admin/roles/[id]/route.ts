import { defineRoute, idParams } from '@/lib/api/handler';
import { roleWriteSchema } from '@/lib/validation/schemas';
import { deleteRole, upsertRole } from '@/server/admin/users';
import { mutationContext } from '@/server/admin/context';

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
