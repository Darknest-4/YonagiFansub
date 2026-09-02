import { defineRoute } from '@/shared/api/handler';
import { updateProfileSchema } from '@/features/users/schemas';
import { db } from '@/infrastructure/db';
import { recordAudit } from '@/shared/api/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Self-service profile update.
 *
 * Deliberately narrow: display name, bio and avatar only. Email, username, role
 * and status are all changed through their own flows, because each carries a
 * side effect (re-verification, uniqueness, privilege checks) that a generic
 * "save profile" handler would be the wrong place to enforce.
 */
export const PATCH = defineRoute({
  auth: 'user',
  rateLimit: 'api:write',
  body: updateProfileSchema,
  async handler({ body, user, ipHash, userAgent, requestId }) {
    const updated = await db.user.update({
      where: { id: user!.id },
      data: {
        displayName: body.displayName,
        bio: body.bio,
        avatarUrl: body.avatarUrl,
      },
      select: { id: true, displayName: true, bio: true, avatarUrl: true },
    });

    await recordAudit({
      actorId: user!.id,
      actorLabel: `@${user!.username}`,
      action: 'UPDATE',
      entityType: 'User',
      entityId: user!.id,
      summary: 'Profil frissítve',
      before: { displayName: user!.displayName },
      after: { displayName: body.displayName },
      ipHash,
      userAgent,
      requestId,
    });

    return updated;
  },
});
