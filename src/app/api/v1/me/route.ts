import { z } from 'zod';
import { defineRoute } from '@/lib/api/handler';
import { ForbiddenError } from '@/lib/errors';
import { db } from '@/lib/db';
import { verifyPassword } from '@/lib/auth/password';
import { destroyCurrentSession } from '@/lib/auth/session';
import { recordAudit } from '@/lib/api/audit';
import { deleteOwnAccount } from '@/server/account-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Self-service account erasure.
 *
 * The password is required again even though the request already carries a
 * valid session. A session can be a browser somebody left open; this is the one
 * action on the site with no undo, so it asks for something only the account
 * holder knows.
 *
 * The audit entry is written *before* the deletion, because afterwards there is
 * no actor to attribute it to — and `actorId` is `SetNull`, so the row survives
 * with the summary intact.
 */
export const DELETE = defineRoute({
  auth: 'user',
  rateLimit: 'account:delete',
  body: z.object({
    password: z.string().min(1, 'Add meg a jelszavad a megerősítéshez.'),
  }),
  async handler({ body, user, ipHash, userAgent, requestId }) {
    const record = await db.user.findUniqueOrThrow({
      where: { id: user!.id },
      select: { passwordHash: true, email: true },
    });

    if (!(await verifyPassword(body.password, record.passwordHash))) {
      throw new ForbiddenError('A jelszó nem egyezik.');
    }

    await recordAudit({
      actorId: user!.id,
      action: 'DELETE',
      entityType: 'User',
      entityId: user!.id,
      summary: `Fiók törölve a tulajdonos kérésére: ${record.email}`,
      ipHash,
      userAgent,
      requestId,
    });

    const { comments } = await deleteOwnAccount(user!.id);

    // The session rows are already gone; this clears the cookies pointing at
    // them so the browser does not spend the next request presenting a
    // credential for an account that no longer exists.
    await destroyCurrentSession();

    return { deleted: true, anonymisedComments: comments };
  },
});
