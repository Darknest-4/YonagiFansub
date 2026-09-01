import 'server-only';
import { db } from '@/lib/db';
import { paginationMeta, toSkipTake, type PaginationInput } from '@/lib/api/pagination';

/**
 * Reading comment threads.
 *
 * ## Why this paginates threads, not comments
 *
 * The obvious implementation — page over every comment, newest first — quietly
 * breaks threading. A reply written today and the comment it answers, written
 * three weeks ago, land on different pages; page one then holds replies whose
 * parents are nowhere in the response, and the client has to either hide them
 * or lift them to the top level, where they read as non-sequiturs.
 *
 * So the unit of pagination is the **thread**: top-level comments are paged, and
 * each one carries its replies with it. A page is therefore always internally
 * consistent — every reply it contains has its parent beside it — and "page 2"
 * means "older conversations", which is what a reader expects it to mean.
 *
 * Replies are capped rather than paged. A fansub episode does not produce
 * hundred-deep threads, and a cap that is never reached costs nothing, while
 * per-thread pagination would be real complexity on both sides for a case that
 * does not occur. If it ever does, the cap is where to start.
 */

/** How many replies travel with a thread. Beyond this the tail is not shown. */
export const MAX_REPLIES_PER_THREAD = 50;

export interface CommentTarget {
  projectId?: string | null;
  episodeId?: string | null;
  newsPostId?: string | null;
}

const authorSelect = {
  select: { username: true, displayName: true, avatarUrl: true },
} as const;

const commentSelect = {
  id: true,
  body: true,
  createdAt: true,
  parentId: true,
  user: authorSelect,
} as const;

/**
 * Narrows a target to exactly the one column that is set.
 *
 * Passing the whole object into `where` would match rows where the *other* ids
 * are null too — which is every comment on every other page, since a comment
 * only ever has one of the three. Being explicit here is what keeps a news post
 * from showing an episode's discussion.
 */
function targetFilter(target: CommentTarget) {
  if (target.projectId) return { projectId: target.projectId };
  if (target.episodeId) return { episodeId: target.episodeId };
  if (target.newsPostId) return { newsPostId: target.newsPostId };
  return null;
}

export interface CommentAuthor {
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface CommentNode {
  id: string;
  body: string;
  createdAt: Date | string;
  parentId: string | null;
  /**
   * `null`, ha a szerző fiókja törölve lett.
   *
   * A hozzászólás ilyenkor is megmarad: törölni magával vinné a rá adott
   * válaszokat, amiket más írt. A megjelenítés „Törölt felhasználó”.
   */
  user: CommentAuthor | null;
}

export interface CommentThread extends CommentNode {
  replies: CommentNode[];
}

export async function listCommentThreads(target: CommentTarget, pagination: PaginationInput) {
  const filter = targetFilter(target);
  if (!filter) return { items: [] as CommentThread[], meta: paginationMeta(0, pagination) };

  const where = {
    ...filter,
    status: 'PUBLISHED' as const,
    deletedAt: null,
    parentId: null,
  };

  const [threads, total] = await Promise.all([
    db.comment.findMany({
      where,
      select: {
        ...commentSelect,
        replies: {
          where: { status: 'PUBLISHED', deletedAt: null },
          select: commentSelect,
          // Ascending inside a thread: a conversation reads top to bottom, even
          // though the threads themselves are newest-first.
          orderBy: { createdAt: 'asc' },
          take: MAX_REPLIES_PER_THREAD,
        },
      },
      orderBy: { createdAt: 'desc' },
      ...toSkipTake(pagination),
    }),
    db.comment.count({ where }),
  ]);

  return { items: threads satisfies CommentThread[], meta: paginationMeta(total, pagination) };
}

/** Total published comments on a target, replies included — the heading's number. */
export async function countComments(target: CommentTarget): Promise<number> {
  const filter = targetFilter(target);
  if (!filter) return 0;

  return db.comment.count({
    where: { ...filter, status: 'PUBLISHED', deletedAt: null },
  });
}
