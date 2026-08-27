import { defineRoute, slugParams } from '@/lib/api/handler';
import { NotFoundError } from '@/lib/errors';
import { getPublicNewsBySlug } from '@/server/news';

export const runtime = 'nodejs';

export const GET = defineRoute({
  auth: 'public',
  rateLimit: 'api:read',
  params: slugParams,
  cache: { sMaxAge: 300 },
  async handler({ params }) {
    const post = await getPublicNewsBySlug(params.slug);
    if (!post) throw new NotFoundError('A hír');
    return post;
  },
});
