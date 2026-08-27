import { defineRoute, idParams } from '@/lib/api/handler';
import { newsWriteSchema } from '@/lib/validation/schemas';
import { getAdminNews, softDeleteNews, updateNews } from '@/server/admin/news';
import { mutationContext } from '@/server/admin/context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  auth: 'news:write',
  rateLimit: 'api:read',
  params: idParams,
  async handler({ params }) {
    return getAdminNews(params.id);
  },
});

export const PUT = defineRoute({
  auth: 'news:write',
  rateLimit: 'admin:write',
  params: idParams,
  body: newsWriteSchema,
  async handler({ params, body, user, ipHash, userAgent, requestId }) {
    return updateNews(params.id, body, mutationContext(user!, { ipHash, userAgent, requestId }));
  },
});

export const DELETE = defineRoute({
  auth: 'news:delete',
  rateLimit: 'admin:write',
  params: idParams,
  async handler({ params, user, ipHash, userAgent, requestId }) {
    await softDeleteNews(params.id, mutationContext(user!, { ipHash, userAgent, requestId }));
    return { deleted: true };
  },
});
