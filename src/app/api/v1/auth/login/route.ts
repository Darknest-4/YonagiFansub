import { defineRoute } from '@/shared/api/handler';
import { loginSchema } from '@/features/auth/schemas';
import { loginUser } from '@/features/auth/service';
import { getSession } from '@/shared/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  auth: 'public',
  rateLimit: 'auth:login',
  body: loginSchema,
  async handler({ body, ip, ipHash, userAgent, requestId }) {
    await loginUser({
      email: body.email,
      password: body.password,
      ip,
      ipHash,
      userAgent,
      requestId,
    });

    // `loginUser` has already set the session cookie; reading the session back
    // gives the client the profile it needs without a second round trip.
    const session = await getSession();

    return {
      user: session
        ? {
            id: session.user.id,
            username: session.user.username,
            displayName: session.user.displayName,
            avatarUrl: session.user.avatarUrl,
            roleKey: session.user.roleKey,
            emailVerified: Boolean(session.user.emailVerifiedAt),
            permissions: session.user.permissions,
          }
        : null,
    };
  },
});
