import { defineRoute } from '@/lib/api/handler';
import { roleWriteSchema } from '@/lib/validation/schemas';
import { listPermissions, listRoles, upsertRole } from '@/server/admin/users';
import { mutationContext } from '@/server/admin/context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  auth: 'role:manage',
  rateLimit: 'api:read',
  async handler() {
    const [roles, permissions] = await Promise.all([listRoles(), listPermissions()]);
    return { roles, permissions };
  },
});

export const POST = defineRoute({
  auth: 'role:manage',
  rateLimit: 'admin:write',
  body: roleWriteSchema,
  async handler({ body, user, ipHash, userAgent, requestId }) {
    return upsertRole(null, body, mutationContext(user!, { ipHash, userAgent, requestId }));
  },
});
