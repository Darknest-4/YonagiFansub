import { z } from 'zod';
import { defineRoute } from '@/lib/api/handler';
import { commentCreateSchema } from '@/lib/validation/schemas';
import { db } from '@/lib/db';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { getSettings } from '@/server/settings';
import { notify } from '@/server/notifications';
import { listCommentThreads } from '@/server/comments';
import { paginationSchema } from '@/lib/api/pagination';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const commentSelect = {
  id: true,
  body: true,
  createdAt: true,
  parentId: true,
  user: { select: { username: true, displayName: true, avatarUrl: true } },
} as const;

/**
 * Published comment threads for one target.
 *
 * Each item is a top-level comment carrying its replies; pagination walks
 * threads rather than individual comments, so a page never contains a reply
 * whose parent is missing. See `server/comments.ts` for why.
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
  async handler({ body, user }) {
    const settings = await getSettings();
    if (!settings.commentsEnabled) {
      throw new ForbiddenError('A hozzászólások jelenleg ki vannak kapcsolva.');
    }

    // A reply must belong to the same target as its parent, or a thread could be
    // hijacked into an unrelated page.
    if (body.parentId) {
      const parent = await db.comment.findFirst({
        where: { id: body.parentId, deletedAt: null, status: 'PUBLISHED' },
        select: {
          id: true,
          userId: true,
          projectId: true,
          episodeId: true,
          newsPostId: true,
        },
      });

      if (!parent) throw new NotFoundError('A hozzászólás, amire válaszolni próbálsz');

      const sameTarget =
        parent.projectId === (body.projectId ?? null) &&
        parent.episodeId === (body.episodeId ?? null) &&
        parent.newsPostId === (body.newsPostId ?? null);

      if (!sameTarget) throw new ForbiddenError('A válasz nem tartozhat másik oldalhoz.');

      if (parent.userId && parent.userId !== user!.id) {
        void notify({
          userId: parent.userId,
          type: 'COMMENT_REPLY',
          title: `${user!.displayName} válaszolt a hozzászólásodra`,
          body: body.body.slice(0, 140),
        });
      }
    }

    const comment = await db.comment.create({
      data: {
        userId: user!.id,
        body: body.body,
        parentId: body.parentId ?? null,
        projectId: body.projectId ?? null,
        episodeId: body.episodeId ?? null,
        newsPostId: body.newsPostId ?? null,
        status: settings.commentsRequireApproval ? 'PENDING' : 'PUBLISHED',
      },
      select: commentSelect,
    });

    return { comment, pendingApproval: settings.commentsRequireApproval };
  },
});
