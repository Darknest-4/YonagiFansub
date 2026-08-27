import 'server-only';
import { cookies } from 'next/headers';
import { cache } from 'react';
import type { UserStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { env, isProduction } from '@/lib/env';
import { logger } from '@/lib/logger';
import { generateToken, hashIp, hashToken } from '@/lib/auth/tokens';
import { SUPER_PERMISSION, type Actor } from '@/lib/auth/permissions';

export const SESSION_COOKIE = isProduction ? '__Host-yonagi_session' : 'yonagi_session';
export const CSRF_COOKIE = isProduction ? '__Host-yonagi_csrf' : 'yonagi_csrf';

/** Refresh the sliding expiry at most once per this window, to avoid a write per request. */
const REFRESH_THRESHOLD_MS = 1000 * 60 * 60 * 12;

export interface SessionUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  roleKey: string;
  roleName: string;
  roleRank: number;
  roleColor: string | null;
  permissions: string[];
  preferences: Record<string, unknown>;
}

export interface SessionContext {
  user: SessionUser;
  sessionId: string;
  expiresAt: Date;
}

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
    path: '/',
    expires,
    // `__Host-` prefixed cookies must not set a domain; that is the point of the
    // prefix — it pins the cookie to this exact origin.
  };
}

export async function createSession(
  userId: string,
  meta: { userAgent?: string | null; ip?: string | null },
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const now = Date.now();
  const expiresAt = new Date(now + env.AUTH_SESSION_TTL_DAYS * 86_400_000);
  const absoluteEnd = new Date(now + env.AUTH_SESSION_ABSOLUTE_TTL_DAYS * 86_400_000);

  await db.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      userAgent: meta.userAgent?.slice(0, 400) ?? null,
      ipHash: hashIp(meta.ip),
      expiresAt,
      absoluteEnd,
    },
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieOptions(expiresAt));

  return { token, expiresAt };
}

/**
 * Resolves the current session.
 *
 * Wrapped in React's `cache()` so that a page rendering fifteen server
 * components performs exactly one session lookup per request.
 */
export const getSession = cache(async (): Promise<SessionContext | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
        },
      },
    },
  });

  if (!session) return null;

  const now = new Date();
  if (session.revokedAt || session.expiresAt <= now || session.absoluteEnd <= now) {
    return null;
  }

  const { user } = session;
  if (user.deletedAt || user.status === 'BANNED' || user.status === 'SUSPENDED') {
    return null;
  }

  // Sliding expiry: extend on use, but never past the absolute end.
  const sinceLastUse = now.getTime() - session.lastUsedAt.getTime();
  if (sinceLastUse > REFRESH_THRESHOLD_MS) {
    const extended = new Date(
      Math.min(
        now.getTime() + env.AUTH_SESSION_TTL_DAYS * 86_400_000,
        session.absoluteEnd.getTime(),
      ),
    );
    // Fire-and-forget: a failed bookkeeping write must not fail the request.
    void db.session
      .update({
        where: { id: session.id },
        data: { lastUsedAt: now, expiresAt: extended },
      })
      .catch((error) => logger.warn('Session refresh failed', { error: String(error) }));
  }

  const permissions =
    user.role.key === 'owner'
      ? [SUPER_PERMISSION]
      : user.role.permissions.map((entry) => entry.permission.key);

  return {
    sessionId: session.id,
    expiresAt: session.expiresAt,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt,
      roleKey: user.role.key,
      roleName: user.role.name,
      roleRank: user.role.rank,
      roleColor: user.role.color,
      permissions,
      preferences: (user.preferences ?? {}) as Record<string, unknown>,
    },
  };
});

export async function destroyCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (token) {
    await db.session
      .updateMany({
        where: { tokenHash: hashToken(token), revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch((error) => logger.warn('Session revoke failed', { error: String(error) }));
  }

  store.delete(SESSION_COOKIE);
  store.delete(CSRF_COOKIE);
}

/** Used after a password change: every other device is logged out. */
export async function revokeAllSessions(userId: string, exceptSessionId?: string): Promise<number> {
  const result = await db.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(exceptSessionId ? { NOT: { id: exceptSessionId } } : {}),
    },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

/** Housekeeping for the nightly job – see `docs/runbook.md`. */
export async function pruneExpiredSessions(): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 86_400_000);
  const result = await db.session.deleteMany({
    where: { OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }] },
  });
  return result.count;
}

export function toActor(user: SessionUser): Actor {
  return {
    id: user.id,
    roleKey: user.roleKey,
    roleRank: user.roleRank,
    permissions: user.permissions,
  };
}
