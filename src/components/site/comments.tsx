import { getCurrentUser } from '@/lib/auth/guards';
import { getSettings } from '@/server/settings';
import { countComments, listCommentThreads, type CommentTarget } from '@/server/comments';
import {
  CommentBoard,
  type CommentTargetView,
  type CommentThreadView,
} from '@/components/site/comment-board';

/**
 * Mounts the discussion under a page.
 *
 * A server component, so the first page of threads, the viewer and the
 * moderation settings are all resolved before anything reaches the browser:
 * the comments are in the HTML, and the client component starts with data
 * instead of a spinner.
 *
 * Renders nothing at all when comments are switched off site-wide. Not a
 * disabled box, not an explanation — a section that cannot be used is furniture,
 * and the setting exists precisely for the periods when the team does not want
 * to be running a comment section.
 */

const FIRST_PAGE = { page: 1, perPage: 10 };

export async function Comments({
  target,
  returnTo,
}: {
  target: CommentTargetView;
  returnTo: string;
}) {
  const settings = await getSettings();
  if (!settings.commentsEnabled) return null;

  const [user, threads, total] = await Promise.all([
    getCurrentUser(),
    listCommentThreads(target as CommentTarget, FIRST_PAGE),
    countComments(target as CommentTarget),
  ]);

  return (
    <CommentBoard
      target={target}
      initialThreads={threads.items as CommentThreadView[]}
      initialMeta={{
        page: Number(threads.meta.page ?? 1),
        totalPages: Number(threads.meta.totalPages ?? 1),
        hasNext: Boolean(threads.meta.hasNext),
      }}
      total={total}
      viewer={
        user
          ? {
              displayName: user.displayName,
              avatarUrl: user.avatarUrl,
              isVerified: Boolean(user.emailVerifiedAt),
            }
          : null
      }
      requiresApproval={settings.commentsRequireApproval}
      returnTo={returnTo}
    />
  );
}
