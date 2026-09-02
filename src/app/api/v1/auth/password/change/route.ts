import { defineRoute } from '@/shared/api/handler';
import { changePasswordSchema } from '@/features/auth/schemas';
import { changePassword } from '@/features/auth/service';
import { getSession } from '@/shared/auth/session';

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
