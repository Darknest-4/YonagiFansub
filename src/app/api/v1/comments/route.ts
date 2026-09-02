import { z } from 'zod';
import { defineRoute } from '@/shared/api/handler';
import { commentCreateSchema } from '@/features/comments/schemas';
import { NotFoundError } from '@/shared/lib/errors';
import { listCommentThreads } from '@/features/comments/queries';
import { createComment } from '@/features/comments/service';
import { paginationSchema } from '@/shared/api/pagination';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Published comment threads for one target.
 *
 * Each item is a top-level comment carrying its replies; pagination walks
 * threads rather than individual comments, so a page never contains a reply
 * whose parent is missing. See `features/comments/queries.ts` for why.
 */
export const GET = defineRoute({
  auth: 'public',
  rateLimit: 'api:read',
  query: paginationSchema.extend({
    projectId: z.string().cuid().optional(),
    episodeId: z.string().cuid().optional(),
    newsPostId: z.string().cuid().optional(),
  }),
  async handler({ query }) {
    if (!(query.projectId ?? query.episodeId ?? query.newsPostId)) {
      throw new NotFoundError('A hozzászólás-cél');
    }

    return listCommentThreads(query, { page: query.page, perPage: query.perPage });
  },
  meta: (result) => result.meta,
});

/**
 * Post a comment.
 *
 * Requires a verified email: an unverified account is an unaccountable one, and
 * comment spam is the first thing a throwaway registration is used for.
 */
export const POST = defineRoute({
  auth: 'verified',
  rateLimit: 'comment:create',
  body: commentCreateSchema,
  handler: ({ body, user }) =>
    createComment({ id: user!.id, displayName: user!.displayName }, body),
});
