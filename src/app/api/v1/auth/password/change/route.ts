import { defineRoute } from '@/lib/api/handler';
import { changePasswordSchema } from '@/lib/validation/schemas';
import { changePassword } from '@/server/auth-service';
import { getSession } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  auth: 'user',
  rateLimit: 'api:write',
  body: changePasswordSchema,
  async handler({ body, user, ipHash, userAgent, requestId }) {
    const session = await getSession();

    await changePassword(user!.id, body.currentPassword, body.password, {
      // Keeping the current session alive means the user is not logged out of
      // the very device they just used to secure their account.
      sessionId: session?.sessionId,
      ipHash,
      userAgent,
      requestId,
    });

    return { changed: true, otherSessionsRevoked: true };
  },
});
