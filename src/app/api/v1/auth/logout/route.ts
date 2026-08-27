import { defineRoute } from '@/lib/api/handler';
import { destroyCurrentSession } from '@/lib/auth/session';
import { recordAudit } from '@/lib/api/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  // `optional` rather than `user`: logging out while already logged out is a
  // no-op, not an error. Returning 401 here would strand a user whose session
  // expired in another tab.
  auth: 'optional',
  async handler({ user, ipHash, userAgent, requestId }) {
    if (user) {
      await recordAudit({
        actorId: user.id,
        actorLabel: user.username,
        action: 'LOGOUT',
        entityType: 'User',
        entityId: user.id,
        summary: 'Kijelentkezés',
        ipHash,
        userAgent,
        requestId,
      });
    }

    await destroyCurrentSession();
    return { loggedOut: true };
  },
});
