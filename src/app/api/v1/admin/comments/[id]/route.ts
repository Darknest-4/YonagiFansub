import { z } from 'zod';
import { CommentStatus } from '@prisma/client';
import { defineRoute, idParams } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';
import { recordAudit } from '@/lib/api/audit';
import { notify } from '@/server/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Moderate a comment.
 *
 * Hiding is a soft action — the row stays, so a wrongly-hidden comment can be
 * restored and the audit trail shows who did what. `DELETED` sets `deletedAt`
 * and is the closest thing to removal the moderator surface offers.
 */
export const PATCH = defineRoute({
  auth: 'comment:moderate',
  rateLimit: 'admin:write',
  params: idParams,
  body: z.object({
    status: z.nativeEnum(CommentStatus),
    moderationNote: z.string().trim().max(500).optional(),
    notifyAuthor: z.boolean().default(false),
  }),
  async handler({ params, body, user, ipHash, userAgent, requestId }) {
    const comment = await db.comment.findFirst({
      where: { id: params.id },
      select: { id: true, status: true, userId: true, body: true },
    });
    if (!comment) throw new NotFoundError('A hozzászólás');

    const updated = await db.comment.update({
      where: { id: params.id },
      data: {
        status: body.status,
        moderationNote: body.moderationNote ?? null,
        moderatedById: user!.id,
        moderatedAt: new Date(),
        deletedAt: body.status === 'DELETED' ? new Date() : null,
      },
      select: { id: true, status: true },
    });

    if (body.notifyAuthor && body.status !== 'PUBLISHED') {
      void notify({
        userId: comment.userId,
        type: 'MODERATION',
        title: 'A hozzászólásod moderálva lett',
        body: body.moderationNote ?? 'A hozzászólásod nem felel meg a közösségi irányelveinknek.',
      });
    }

    await recordAudit({
      actorId: user!.id,
      actorLabel: `${user!.displayName} (@${user!.username})`,
      action: 'UPDATE',
      entityType: 'Comment',
      entityId: params.id,
      summary: `Hozzászólás moderálva: ${comment.status} → ${body.status}`,
      ipHash,
      userAgent,
      requestId,
    });

    return updated;
  },
});
