import 'server-only';
import type { CommentStatus } from '@prisma/client';
import { db } from '@/infrastructure/db';
import { ForbiddenError, NotFoundError } from '@/shared/lib/errors';
import { paginationMeta, toSkipTake, type PaginationInput } from '@/shared/api/pagination';

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
  editedAt: true,
  parentId: true,
  status: true,
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
  /** Set when the author has edited the text, so the reader can tell. */
  editedAt: Date | string | null;
  parentId: string | null;
  /**
   * A tombstone: the author deleted this comment, but it had replies.
   *
   * Removing the row would take those replies with it — the same cascade that
   * account erasure had to work around. So the text and the author come off and
   * the position in the conversation stays, exactly as every mature comment
   * system does it.
   */
  deleted: boolean;
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

/**
 * Strips a tombstone down to what a reader may see.
 *
 * Done here rather than in the query, because the body and the author still
 * exist in the row — a moderator looking at the same comment in the admin panel
 * needs to see what was written.
 */
function toNode(row: {
  id: string;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
  parentId: string | null;
  status: CommentStatus;
  user: CommentAuthor | null;
}): CommentNode {
  const deleted = row.status === 'DELETED';

  return {
    id: row.id,
    body: deleted ? '' : row.body,
    createdAt: row.createdAt,
    editedAt: row.editedAt,
    parentId: row.parentId,
    deleted,
    user: deleted ? null : row.user,
  };
}

export async function listCommentThreads(target: CommentTarget, pagination: PaginationInput) {
  const filter = targetFilter(target);
  if (!filter) return { items: [] as CommentThread[], meta: paginationMeta(0, pagination) };

  /*
    Top-level comments include DELETED ones, which replies-only rows never are:
    an author deleting a comment with no replies has it removed outright, and
    the status is only set when there was a conversation underneath worth
    keeping. So a DELETED row here is always a tombstone holding a thread open.
  */
  const where = {
    ...filter,
    status: { in: ['PUBLISHED', 'DELETED'] as CommentStatus[] },
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

  const items: CommentThread[] = threads.map((thread) => ({
    ...toNode(thread),
    replies: thread.replies.map(toNode),
  }));

  return { items, meta: paginationMeta(total, pagination) };
}

/** Total published comments on a target, replies included — the heading's number. */
export async function countComments(target: CommentTarget): Promise<number> {
  const filter = targetFilter(target);
  if (!filter) return 0;

  return db.comment.count({
    where: { ...filter, status: 'PUBLISHED', deletedAt: null },
  });
}

// ── Az író saját hozzászólása ────────────────────────────────────────────────

/**
 * How long an author may edit their own comment.
 *
 * A window rather than "forever": once somebody has replied, silently rewriting
 * the text they replied to turns their answer into a non-sequitur. Fifteen
 * minutes covers the typo and the forgotten word, which is what editing is
 * actually for here, and the `editedAt` marker covers the rest.
 *
 * The number is the `commentEditMinutes` setting; this is the fallback for the
 * callers that have no settings to hand (tests, background work).
 */
export const DEFAULT_EDIT_MINUTES = 15;
export const EDIT_WINDOW_MS = DEFAULT_EDIT_MINUTES * 60 * 1000;

/**
 * Zero minutes means editing is switched off, and that has to be checked before
 * the subtraction: `now - createdAt <= 0` is true for a comment written this
 * millisecond, so a naive window of 0 would let an author edit for as long as
 * the clock took to tick.
 */
export function withinEditWindow(
  createdAt: Date,
  now = new Date(),
  minutes = DEFAULT_EDIT_MINUTES,
): boolean {
  if (minutes <= 0) return false;
  return now.getTime() - createdAt.getTime() <= minutes * 60 * 1000;
}

interface OwnComment {
  id: string;
  userId: string | null;
  createdAt: Date;
  status: CommentStatus;
  parentId: string | null;
}

/**
 * Loads a comment and checks the caller wrote it.
 *
 * A moderated comment is deliberately *not* editable: HIDDEN means somebody
 * decided the text was a problem, and letting its author rewrite it would turn
 * moderation into a suggestion.
 */
async function loadOwn(commentId: string, userId: string): Promise<OwnComment> {
  const comment = await db.comment.findFirst({
    where: { id: commentId, deletedAt: null },
    select: { id: true, userId: true, createdAt: true, status: true, parentId: true },
  });

  if (!comment) throw new NotFoundError('A hozzászólás');
  if (comment.userId !== userId) {
    // Deliberately the same message as a missing comment: whether a given id
    // belongs to somebody else is not information a stranger needs.
    throw new NotFoundError('A hozzászólás');
  }

  return comment;
}

export async function editOwnComment(
  commentId: string,
  userId: string,
  body: string,
  requiresApproval: boolean,
  editMinutes = DEFAULT_EDIT_MINUTES,
) {
  const comment = await loadOwn(commentId, userId);

  if (comment.status === 'HIDDEN' || comment.status === 'DELETED') {
    throw new ForbiddenError('Ezt a hozzászólást már nem lehet szerkeszteni.');
  }

  // Off entirely, which is a different situation from "you were too slow" and
  // deserves a different sentence — telling somebody their time ran out when
  // they never had any sends them looking for a window that does not exist.
  if (editMinutes <= 0) {
    throw new ForbiddenError(
      'A hozzászólások szerkesztése jelenleg ki van kapcsolva. Írhatsz helyette választ.',
    );
  }

  if (!withinEditWindow(comment.createdAt, new Date(), editMinutes)) {
    throw new ForbiddenError(
      `A szerkesztésre ${editMinutes} perc áll rendelkezésre — ez az idő letelt. Írhatsz helyette választ.`,
    );
  }

  /*
    An edit re-enters the moderation queue where approval is on. Otherwise the
    queue is trivially bypassed: post something harmless, wait for approval,
    then edit it into whatever you actually wanted to post.
  */
  const status = requiresApproval ? 'PENDING' : comment.status;

  return db.comment.update({
    where: { id: commentId },
    data: { body, editedAt: new Date(), status },
    select: { ...commentSelect, status: true },
  });
}

/**
 * The author removes their own comment.
 *
 * With replies underneath it the row survives as a tombstone, for the same
 * reason account erasure detaches rather than deletes: the cascade would take
 * other people's posts with it. With nothing underneath, there is nothing to
 * hold open and the row goes.
 */
export async function deleteOwnComment(
  commentId: string,
  userId: string,
): Promise<{ tombstoned: boolean }> {
  // Called for the ownership check, which throws. There is nothing to read
  // from it here — whether to tombstone depends on the replies, not the row.
  await loadOwn(commentId, userId);

  const replies = await db.comment.count({
    where: { parentId: commentId, deletedAt: null, status: 'PUBLISHED' },
  });

  if (replies === 0) {
    await db.comment.delete({ where: { id: commentId } });
    return { tombstoned: false };
  }

  // `editedAt` stays null: it means "the author changed the text", and a
  // tombstone has no text. `updatedAt` already records when this happened.
  await db.comment.update({
    where: { id: commentId },
    data: { status: 'DELETED' },
  });

  return { tombstoned: true };
}
