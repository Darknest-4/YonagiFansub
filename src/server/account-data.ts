import 'server-only';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { ConflictError, NotFoundError } from '@/lib/errors';
import { SUPER_PERMISSION } from '@/lib/auth/permissions';

/**
 * The two data rights the privacy policy promises and the software did not
 * keep: a copy of everything, and erasure.
 *
 * `src/content/legal.ts` has said since day one that a visitor may ask for
 * access, rectification, erasure, restriction and portability. Rectification
 * (the profile form) and restriction (notification preferences) were built.
 * Access and portability had no implementation at all, and erasure could only
 * be performed by an administrator on somebody's behalf — which is not the same
 * right.
 */

// ── Export ───────────────────────────────────────────────────────────────────

/**
 * Everything the database holds about one account, as plain JSON.
 *
 * Structured by *where it came from* rather than by table, because the person
 * reading it did not design the schema: they know they wrote comments and rated
 * things, not that there is a `WatchProgress` model.
 *
 * Session rows are included but reduced to what the account holder can act on —
 * when it was used and from what browser. The token hash is not personal data
 * they need and handing it out in a file that lands in a downloads folder would
 * be careless.
 */
export async function exportAccount(userId: string) {
  const user = await db.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: {
      id: true,
      email: true,
      username: true,
      displayName: true,
      bio: true,
      avatarUrl: true,
      bannerUrl: true,
      status: true,
      preferences: true,
      emailVerifiedAt: true,
      lastLoginAt: true,
      createdAt: true,
      role: { select: { key: true, name: true } },
    },
  });

  if (!user) throw new NotFoundError('A fiók');

  const [comments, favorites, ratings, progress, notifications, sessions] =
    await Promise.all([
      db.comment.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: {
          body: true,
          status: true,
          createdAt: true,
          project: { select: { slug: true, title: true } },
          episode: { select: { number: true, project: { select: { slug: true } } } },
          newsPost: { select: { slug: true, title: true } },
        },
      }),
      db.favorite.findMany({
        where: { userId },
        select: { notify: true, createdAt: true, project: { select: { slug: true, title: true } } },
      }),
      db.rating.findMany({
        where: { userId },
        select: { score: true, updatedAt: true, project: { select: { slug: true, title: true } } },
      }),
      db.watchProgress.findMany({
        where: { userId },
        select: {
          positionSec: true,
          completed: true,
          updatedAt: true,
          episode: {
            select: { number: true, title: true, project: { select: { slug: true } } },
          },
        },
      }),
      db.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { type: true, title: true, body: true, readAt: true, createdAt: true },
      }),
      db.session.findMany({
        where: { userId },
        select: { userAgent: true, createdAt: true, lastUsedAt: true, expiresAt: true },
      }),
    ]);

  return {
    exportaltva: new Date().toISOString(),
    // Names the person, not the schema: this file is read by its subject.
    fiok: {
      azonosito: user.id,
      email: user.email,
      felhasznalonev: user.username,
      megjelenitesiNev: user.displayName,
      bemutatkozas: user.bio,
      avatar: user.avatarUrl,
      boritokep: user.bannerUrl,
      allapot: user.status,
      szerepkor: user.role?.name ?? null,
      emailMegerositve: user.emailVerifiedAt,
      utolsoBelepes: user.lastLoginAt,
      regisztralt: user.createdAt,
    },
    beallitasok: user.preferences,
    hozzaszolasok: comments,
    kedvencek: favorites,
    ertekelesek: ratings,
    nezesiElorehaladas: progress,
    ertesitesek: notifications,
    munkamenetek: sessions,
  };
}

// ── Erasure ──────────────────────────────────────────────────────────────────

/**
 * Deletes the account itself.
 *
 * Personal rows go entirely. Comments do not: the `SetNull` on
 * `comments.userId` detaches the author and leaves the text, because the
 * alternative deletes replies written by other people. That is a deliberate
 * reading of erasure — the identifying link is what is erased — and it is
 * spelled out both in the confirmation dialog and in the privacy policy, since
 * a policy has to describe what the software actually does.
 *
 * Rows that merely *record* the account's administrative actions (audit log,
 * authored news, created projects) already use `SetNull` in the schema and are
 * left to it: an audit trail that vanishes when its subject asks for erasure is
 * not an audit trail.
 */
export async function deleteOwnAccount(userId: string): Promise<{ comments: number }> {
  const user = await db.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true, email: true, role: { select: { key: true, permissions: true } } },
  });

  if (!user) throw new NotFoundError('A fiók');

  await assertNotLastOwner(user.id);

  const comments = await db.comment.count({ where: { userId } });

  await db.$transaction(async (tx) => {
    // Explicit rather than relying on cascade: these are the rows that carry
    // personal data, and naming them here is what makes the set reviewable.
    await tx.session.deleteMany({ where: { userId } });
    await tx.passwordResetToken.deleteMany({ where: { userId } });
    await tx.emailVerificationToken.deleteMany({ where: { userId } });
    await tx.notification.deleteMany({ where: { userId } });
    await tx.favorite.deleteMany({ where: { userId } });
    await tx.rating.deleteMany({ where: { userId } });
    await tx.watchProgress.deleteMany({ where: { userId } });

    await tx.user.delete({ where: { id: userId } });
  });

  logger.info('Fiók törölve a tulajdonos kérésére', { userId, comments });

  return { comments };
}

/**
 * Refuses to delete the last account that can administer the site.
 *
 * Not a data-protection limit but an operational one: an installation with no
 * owner cannot grant anyone the role back, and the only repair is direct
 * database access. The person is told what to do instead — hand the role over
 * first — rather than simply being refused.
 */
async function assertNotLastOwner(userId: string): Promise<void> {
  const owners = await db.user.findMany({
    where: {
      deletedAt: null,
      role: { permissions: { some: { permission: { key: SUPER_PERMISSION } } } },
    },
    select: { id: true },
  });

  const isOwner = owners.some((owner) => owner.id === userId);
  if (isOwner && owners.length <= 1) {
    throw new ConflictError(
      'Ez az egyetlen tulajdonosi fiók — törlés előtt add át a szerepkört valaki másnak, ' +
        'különben az oldal adminisztrálhatatlanná válik.',
    );
  }
}
