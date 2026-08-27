import { defineRoute, idParams } from '@/lib/api/handler';
import { releaseWriteSchema } from '@/lib/validation/schemas';
import { getAdminRelease, softDeleteRelease, updateRelease } from '@/server/admin/releases';
import { mutationContext } from '@/server/admin/context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  auth: 'release:write',
  rateLimit: 'api:read',
  params: idParams,
  async handler({ params }) {
    return getAdminRelease(params.id);
  },
});

export const PUT = defineRoute({
  auth: 'release:write',
  rateLimit: 'admin:write',
  params: idParams,
  body: releaseWriteSchema,
  async handler({ params, body, user, ipHash, userAgent, requestId }) {
    return updateRelease(params.id, body, mutationContext(user!, { ipHash, userAgent, requestId }));
  },
});

export const DELETE = defineRoute({
  auth: 'release:delete',
  rateLimit: 'admin:write',
  params: idParams,
  async handler({ params, user, ipHash, userAgent, requestId }) {
    await softDeleteRelease(params.id, mutationContext(user!, { ipHash, userAgent, requestId }));
    return { deleted: true };
  },
});
