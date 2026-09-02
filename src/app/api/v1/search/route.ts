import { defineRoute } from '@/shared/api/handler';
import { searchQuerySchema } from '@/lib/validation/schemas';
import { search } from '@/features/search/service';

// Rendered per request: the response depends on the database, which is not
// reachable during `next build`. See `(site)/layout.tsx` for the full reasoning.
export const dynamic = 'force-dynamic';

export const runtime = 'nodejs';

export const GET = defineRoute({
  auth: 'public',
  // Tighter than the general read budget: search is the most expensive public
  // query and the easiest one to hammer from a script.
  rateLimit: 'search:query',
  query: searchQuerySchema,
  cache: { sMaxAge: 30 },
  async handler({ query }) {
    return search(query.q, { limit: query.limit, type: query.type });
  },
});
