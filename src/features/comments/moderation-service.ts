import 'server-only';
import type { CommentStatus, Prisma } from '@prisma/client';
import { db } from '@/infrastructure/db';
import { NotFoundError } from '@/shared/lib/errors';
import { notify } from '@/features/notifications/service';
import {
  paginationMeta,
  toSkipTake,
  type PaginationInput,
} from '@/shared/api/pagination';
import type { MutationContext } from '@/shared/api/mutation-context';

/**
 * A moderálási sor.
 *
 * Külön a `queries.ts`-től, ahol a nyilvános szálak vannak: ott az a kérdés,
 * mit lát az olvasó, itt az, mit kell eldönteni. A két nézetnek szándékosan
 * más a szűrése — a moderátor a függőben lévőket akarja látni elöl, az olvasó
 * pedig a függőben lévőket egyáltalán nem.
 */

export interface ModerationFilters {
  status?: CommentStatus;
  q?: string;
}

export async function listCommentsForModeration(
  filters: ModerationFilters,
  pagination: PaginationInput,
) {
  const where: Prisma.CommentWhereInput = { deletedAt: null };
  if (filters.status) where.status = filters.status;
  if (filters.q) where.body = { contains: filters.q, mode: 'insensitive' };

  const [items, total] = await Promise.all([
    db.comment.findMany({
      where,
      select: {
        id: true,
        body: true,
        status: true,
        createdAt: true,
        user: { select: { username: true, displayName: true, avatarUrl: true } },
        project: { select: { slug: true, title: true } },
        episode: { select: { number: true, project: { select: { slug: true, title: true } } } },
        newsPost: { select: { slug: true, title: true } },
      },
      // Pending first, then newest: the moderation queue's natural order.
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      ...toSkipTake(pagination),
    }),
    db.comment.count({ where }),
  ]);

  return { items, meta: paginationMeta(total, pagination) };
}

export interface ModerationDecision {
  status: CommentStatus;
  moderationNote?: string | undefined;
  notifyAuthor: boolean;
}

/**
 * Egy hozzászólás moderálása.
 *
 * Az elrejtés puha művelet: a sor megmarad, tehát a tévedésből elrejtett
 * hozzászólás visszaállítható, és a naplóból látszik, ki mit csinált. A
 * `DELETED` a `deletedAt`-et állítja — ennél tovább a moderátori felület nem
 * megy.
 */
export async function moderateComment(
  commentId: string,
  decision: ModerationDecision,
  context: MutationContext,
) {
  const comment = await db.comment.findFirst({
    where: { id: commentId },
    select: { id: true, status: true, userId: true, body: true },
  });
  if (!comment) throw new NotFoundError('A hozzászólás');

  const updated = await db.comment.update({
    where: { id: commentId },
    data: {
      status: decision.status,
      moderationNote: decision.moderationNote ?? null,
      moderatedById: context.actor.id,
      moderatedAt: new Date(),
      deletedAt: decision.status === 'DELETED' ? new Date() : null,
    },
    select: { id: true, status: true, userId: true },
  });

  // A szerző hiánya törölt fiókot jelent — nincs kit értesíteni.
  if (decision.notifyAuthor && decision.status !== 'PUBLISHED' && comment.userId) {
    void notify({
      userId: comment.userId,
      type: 'MODERATION',
      title: 'A hozzászólásod moderálva lett',
      body: decision.moderationNote ?? 'A hozzászólásod nem felel meg a közösségi irányelveinknek.',
    });
  }

  await context.audit({
    action: 'UPDATE',
    entityType: 'Comment',
    entityId: commentId,
    summary: `Hozzászólás moderálva: ${comment.status} → ${decision.status}`,
  });

  return updated;
}
