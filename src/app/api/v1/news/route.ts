import { defineRoute } from '@/lib/api/handler';
import { newsQuerySchema } from '@/lib/validation/schemas';
import { listNews } from '@/server/news';

// Rendered per request: the response depends on the database, which is not
// reachable during `next build`. See `(site)/layout.tsx` for the full reasoning.
export const dynamic = 'force-dynamic';

export const runtime = 'nodejs';

export const GET = defineRoute({
  auth: 'public',
  rateLimit: 'api:read',
  query: newsQuerySchema,
  cache: { sMaxAge: 120 },
  async handler({ query }) {
    return listNews(
      { q: query.q, category: query.category, includeUnpublished: false },
      { page: query.page, perPage: query.perPage },
    );
  },
  meta: (result) => result.meta,
});
