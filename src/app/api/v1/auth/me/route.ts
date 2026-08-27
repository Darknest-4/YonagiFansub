import { defineRoute } from '@/lib/api/handler';
import { canAccessAdmin } from '@/lib/auth/permissions';
import { toActor } from '@/lib/auth/session';
import { countUnread } from '@/server/notifications';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Current session snapshot.
 *
 * Returns `null` rather than 401 when nobody is signed in: "who am I" is a
 * legitimate question with a legitimate answer of "nobody", and modelling it as
 * an error forces every caller to wrap it in a try/catch.
 */
export const GET = defineRoute({
  auth: 'optional',
  rateLimit: 'api:read',
  async handler({ user }) {
    if (!user) return { user: null };

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        status: user.status,
        emailVerified: Boolean(user.emailVerifiedAt),
        role: { key: user.roleKey, name: user.roleName, color: user.roleColor },
        permissions: user.permissions,
        canAccessAdmin: canAccessAdmin(toActor(user)),
        preferences: user.preferences,
        unreadNotifications: await countUnread(user.id),
      },
    };
  },
});
