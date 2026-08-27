import { defineRoute } from '@/lib/api/handler';
import { releaseQuerySchema } from '@/lib/validation/schemas';
import { listReleases } from '@/server/releases';

export const runtime = 'nodejs';

export const GET = defineRoute({
  auth: 'public',
  rateLimit: 'api:read',
  query: releaseQuerySchema,
  cache: { sMaxAge: 60 },
  async handler({ query }) {
    return listReleases(
      {
        projectId: query.projectId,
        projectSlug: query.projectSlug,
        resolution: query.resolution,
        kind: query.kind,
        sort: query.sort,
        includeUnpublished: false,
      },
      { page: query.page, perPage: query.perPage },
    );
  },
  meta: (result) => result.meta,
});
