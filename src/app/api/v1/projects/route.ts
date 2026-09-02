import { defineRoute } from '@/shared/api/handler';
import { projectQuerySchema } from '@/features/projects/schemas';
import { parseList } from '@/shared/api/pagination';
import { listProjects } from '@/features/projects/queries';

// Rendered per request: the response depends on the database, which is not
// reachable during `next build`. See `(site)/layout.tsx` for the full reasoning.
export const dynamic = 'force-dynamic';

export const runtime = 'nodejs';

/**
 * Public project catalogue.
 *
 * `includeUnpublished` is never derived from the request: this endpoint serves
 * the public catalogue and nothing else. Draft access lives under `/admin`,
 * behind its own permission.
 */
export const GET = defineRoute({
  auth: 'public',
  rateLimit: 'api:read',
  query: projectQuerySchema,
  cache: { sMaxAge: 60 },
  async handler({ query }) {
    return listProjects(
      {
        q: query.q,
        status: query.status,
        type: query.type,
        season: query.season,
        year: query.year,
        genres: parseList(query.genre),
        featured: query.featured === undefined ? undefined : query.featured === 'true',
        sort: query.sort,
        includeUnpublished: false,
      },
      { page: query.page, perPage: query.perPage },
    );
  },
  meta: (result) => result.meta,
});
