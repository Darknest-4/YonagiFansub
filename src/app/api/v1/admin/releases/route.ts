import { defineRoute } from '@/lib/api/handler';
import { releaseQuerySchema, releaseWriteSchema } from '@/lib/validation/schemas';
import { listReleases } from '@/server/releases';
import { createRelease } from '@/server/admin/releases';
import { mutationContext } from '@/server/admin/context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  auth: 'release:write',
  rateLimit: 'api:read',
  query: releaseQuerySchema,
  async handler({ query }) {
    return listReleases(
      {
        projectId: query.projectId,
        projectSlug: query.projectSlug,
        resolution: query.resolution,
        kind: query.kind,
        status: query.status,
        sort: query.sort,
        includeUnpublished: true,
      },
      { page: query.page, perPage: query.perPage },
    );
  },
  meta: (result) => result.meta,
});

export const POST = defineRoute({
  auth: 'release:write',
  rateLimit: 'admin:write',
  body: releaseWriteSchema,
  async handler({ body, user, ipHash, userAgent, requestId }) {
    return createRelease(body, mutationContext(user!, { ipHash, userAgent, requestId }));
  },
});
