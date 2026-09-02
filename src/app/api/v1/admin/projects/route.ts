import { defineRoute } from '@/shared/api/handler';
import { projectQuerySchema, projectWriteSchema } from '@/features/projects/schemas';
import { parseList } from '@/shared/api/pagination';
import { listProjects } from '@/features/projects/queries';
import { createProject } from '@/features/projects/admin-service';
import { mutationContext } from '@/shared/api/mutation-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Admin catalogue view – identical filters to the public one, drafts included. */
export const GET = defineRoute({
  auth: 'project:read',
  rateLimit: 'api:read',
  query: projectQuerySchema,
  async handler({ query }) {
    return listProjects(
      {
        q: query.q,
        status: query.status,
        type: query.type,
        season: query.season,
        year: query.year,
        genres: parseList(query.genre),
        sort: query.sort,
        includeUnpublished: true,
      },
      { page: query.page, perPage: query.perPage },
    );
  },
  meta: (result) => result.meta,
});

export const POST = defineRoute({
  auth: 'project:write',
  rateLimit: 'admin:write',
  body: projectWriteSchema,
  async handler({ body, user, ipHash, userAgent, requestId }) {
    return createProject(body, mutationContext(user!, { ipHash, userAgent, requestId }));
  },
});
