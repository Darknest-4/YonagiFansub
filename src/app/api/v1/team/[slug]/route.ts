import { defineRoute, slugParams } from '@/lib/api/handler';
import { NotFoundError } from '@/lib/errors';
import { getPublicTeamMember } from '@/server/team';

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
