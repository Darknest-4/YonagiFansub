import { z } from 'zod';
import { CommentStatus } from '@prisma/client';
import { defineRoute, idParams } from '@/shared/api/handler';
import { moderateComment } from '@/features/comments/moderation-service';
import { mutationContext } from '@/shared/api/mutation-context';

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
  handler: ({ params, body, user, ipHash, userAgent, requestId }) =>
    moderateComment(params.id, body, mutationContext(user!, { ipHash, userAgent, requestId })),
});
