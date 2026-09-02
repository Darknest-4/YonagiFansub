import 'server-only';
import { db } from '@/infrastructure/db';
import { ForbiddenError, NotFoundError } from '@/shared/lib/errors';
import { getSettings } from '@/features/settings/service';
import { notify } from '@/features/notifications/service';
import type { commentCreateSchema } from '@/features/comments/schemas';
import type { z } from 'zod';

/**
 * Hozzászólás írása.
 *
 * Ez korábban a route-fájlban lakott, és az volt a baj vele, hogy a szabályai
 * ott láthatatlanok voltak: a moderálási kapcsoló, a válaszok célellenőrzése és
 * az értesítés mind döntés, nem HTTP-kezelés. Így viszont ugyanaz a szabály
 * érvényes akkor is, ha egy admin eszköz vagy egy jövőbeli import hívja meg.
 */

export type CommentCreateInput = z.infer<typeof commentCreateSchema>;

const commentSelect = {
  id: true,
  body: true,
  createdAt: true,
  parentId: true,
  user: { select: { username: true, displayName: true, avatarUrl: true } },
} as const;

export interface CommentAuthorContext {
  id: string;
  displayName: string;
}

export async function createComment(author: CommentAuthorContext, input: CommentCreateInput) {
  const settings = await getSettings();
  if (!settings.commentsEnabled) {
    throw new ForbiddenError('A hozzászólások jelenleg ki vannak kapcsolva.');
  }

  if (input.parentId) await attachToParent(author, input);

  const comment = await db.comment.create({
    data: {
      userId: author.id,
      body: input.body,
      parentId: input.parentId ?? null,
      projectId: input.projectId ?? null,
      episodeId: input.episodeId ?? null,
      newsPostId: input.newsPostId ?? null,
      status: settings.commentsRequireApproval ? 'PENDING' : 'PUBLISHED',
    },
    select: commentSelect,
  });

  return { comment, pendingApproval: settings.commentsRequireApproval };
}

/**
 * A válasz ellenőrzése és az értesítés.
 *
 * A célegyezés nem formaság: enélkül egy szálat át lehetne téríteni egy másik
 * oldalra — a válasz ott jelenne meg, ahova a szülője tartozik, miközben a
 * tartalma egészen máshoz szól.
 */
async function attachToParent(author: CommentAuthorContext, input: CommentCreateInput) {
  const parent = await db.comment.findFirst({
    where: { id: input.parentId!, deletedAt: null, status: 'PUBLISHED' },
    select: { id: true, userId: true, projectId: true, episodeId: true, newsPostId: true },
  });

  if (!parent) throw new NotFoundError('A hozzászólás, amire válaszolni próbálsz');

  const sameTarget =
    parent.projectId === (input.projectId ?? null) &&
    parent.episodeId === (input.episodeId ?? null) &&
    parent.newsPostId === (input.newsPostId ?? null);

  if (!sameTarget) throw new ForbiddenError('A válasz nem tartozhat másik oldalhoz.');

  if (parent.userId && parent.userId !== author.id) {
    void notify({
      userId: parent.userId,
      type: 'COMMENT_REPLY',
      title: `${author.displayName} válaszolt a hozzászólásodra`,
      body: input.body.slice(0, 140),
    });
  }
}
