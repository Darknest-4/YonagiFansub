import { defineRoute } from '@/shared/api/handler';
import { newsQuerySchema, newsWriteSchema } from '@/lib/validation/schemas';
import { listNews } from '@/features/news/queries';
import { createNews } from '@/features/news/admin-service';
import { mutationContext } from '@/shared/api/mutation-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  auth: 'news:write',
  rateLimit: 'api:read',
  query: newsQuerySchema,
  async handler({ query }) {
    return listNews(
      { q: query.q, category: query.category, status: query.status, includeUnpublished: true },
      { page: query.page, perPage: query.perPage },
    );
  },
  meta: (result) => result.meta,
});

export const POST = defineRoute({
  auth: 'news:write',
  rateLimit: 'admin:write',
  body: newsWriteSchema,
  async handler({ body, user, ipHash, userAgent, requestId }) {
    return createNews(body, mutationContext(user!, { ipHash, userAgent, requestId }));
  },
});
