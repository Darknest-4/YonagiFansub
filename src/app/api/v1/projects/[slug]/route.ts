import { defineRoute, slugParams } from '@/lib/api/handler';
import { NotFoundError } from '@/lib/errors';
import { getPublicProjectBySlug } from '@/server/projects';

// Rendered per request: the response depends on the database, which is not
// reachable during `next build`. See `(site)/layout.tsx` for the full reasoning.
export const dynamic = 'force-dynamic';

export const runtime = 'nodejs';

export const GET = defineRoute({
  auth: 'public',
  rateLimit: 'api:read',
  params: slugParams,
  cache: { sMaxAge: 120 },
  async handler({ params }) {
    const project = await getPublicProjectBySlug(params.slug);
    if (!project) throw new NotFoundError('A projekt');
    return project;
  },
});
