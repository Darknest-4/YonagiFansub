import { defineRoute, idParams } from '@/shared/api/handler';
import { userUpdateSchema } from '@/features/users/schemas';
import { getAdminUser, softDeleteUser, updateUser } from '@/features/users/admin-service';
import { mutationContext } from '@/shared/api/mutation-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  auth: 'user:read',
  rateLimit: 'api:read',
  params: idParams,
  async handler({ params }) {
    return getAdminUser(params.id);
  },
});

export const PUT = defineRoute({
  auth: 'user:write',
  rateLimit: 'admin:write',
  params: idParams,
  body: userUpdateSchema,
  async handler({ params, body, user, ipHash, userAgent, requestId }) {
    return updateUser(params.id, body, mutationContext(user!, { ipHash, userAgent, requestId }));
  },
});

export const DELETE = defineRoute({
  auth: 'user:delete',
  rateLimit: 'admin:write',
  params: idParams,
  async handler({ params, user, ipHash, userAgent, requestId }) {
    await softDeleteUser(params.id, mutationContext(user!, { ipHash, userAgent, requestId }));
    return { deleted: true };
  },
});
