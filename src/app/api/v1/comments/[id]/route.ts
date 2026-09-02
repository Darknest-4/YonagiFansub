import { defineRoute, idParams } from '@/lib/api/handler';
import { commentEditSchema } from '@/lib/validation/schemas';
import { getSettings } from '@/server/settings';
import { deleteOwnComment, editOwnComment } from '@/server/comments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A commenter's control over their own comment.
 *
 * Separate from `/api/v1/admin/comments/[id]`, which is the moderator's view of
 * the same row. The two do different things and answer to different rules — a
 * moderator may hide any comment and never edits one; an author may edit their
 * own briefly and never anybody else's — so they are two endpoints rather than
 * one with a branch in the middle.
 */

export const PATCH = defineRoute({
  auth: 'verified',
  rateLimit: 'api:write',
  params: idParams,
  body: commentEditSchema,
  async handler({ params, body, user }) {
    const settings = await getSettings();

    const comment = await editOwnComment(
      params.id,
      user!.id,
      body.body,
      settings.commentsRequireApproval,
      settings.commentEditMinutes,
    );

    return {
      comment,
      // The client needs to say "back in the queue" rather than showing the new
      // text as live, which is what an edit under approval actually means.
      pendingApproval: comment.status === 'PENDING',
    };
  },
});

export const DELETE = defineRoute({
  auth: 'user',
  rateLimit: 'api:write',
  params: idParams,
  async handler({ params, user }) {
    return deleteOwnComment(params.id, user!.id);
  },
});
