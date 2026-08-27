import { defineRoute } from '@/lib/api/handler';
import { projectQuerySchema } from '@/lib/validation/schemas';
import { parseList } from '@/lib/api/pagination';
import { listProjects } from '@/server/projects';

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
