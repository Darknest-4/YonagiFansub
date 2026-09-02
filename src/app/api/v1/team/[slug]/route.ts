import { defineRoute, slugParams } from '@/shared/api/handler';
import { NotFoundError } from '@/shared/lib/errors';
import { getPublicTeamMember } from '@/features/team/queries';

// Rendered per request: the response depends on the database, which is not
// reachable during `next build`. See `(site)/layout.tsx` for the full reasoning.
export const dynamic = 'force-dynamic';

export const runtime = 'nodejs';

export const GET = defineRoute({
  auth: 'public',
  rateLimit: 'api:read',
  params: slugParams,
  cache: { sMaxAge: 300 },
  async handler({ params }) {
    const member = await getPublicTeamMember(params.slug);
    if (!member) throw new NotFoundError('A csapattag');
    return member;
  },
});
