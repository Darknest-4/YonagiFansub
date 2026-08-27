import 'server-only';
import { redirect } from 'next/navigation';
import { ForbiddenError, UnauthorizedError } from '@/lib/errors';
import {
  canAccessAdmin,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  type Actor,
  type Permission,
} from '@/lib/auth/permissions';
import { getSession, toActor, type SessionUser } from '@/lib/auth/session';

/**
 * Authorisation guards.
 *
 * Two flavours deliberately kept apart:
 *   • `require*` — throws an `AppError`. Used inside API route handlers, where
 *     the error is turned into a JSON response by the handler wrapper.
 *   • `ensure*`  — redirects. Used inside pages and layouts, where a browser
 *     navigation is the correct outcome.
 *
 * Mixing them is the usual way an app ends up returning an HTML login page to a
 * `fetch()` call, so the split is enforced by naming.
 */

export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await getSession();
  return session?.user ?? null;
}

export async function getActor(): Promise<Actor | null> {
  const session = await getSession();
  return session ? toActor(session.user) : null;
}

// ── API-side guards ──────────────────────────────────────────────────────────

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export async function requireVerifiedUser(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.emailVerifiedAt) {
    throw new ForbiddenError('Erősítsd meg az e-mail-címed a folytatáshoz.');
  }
  return user;
}

export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!hasPermission(toActor(user), permission)) {
    throw new ForbiddenError('Nincs jogosultságod ehhez a művelethez.');
  }
  return user;
}

export async function requireAnyPermission(permissions: Permission[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!hasAnyPermission(toActor(user), permissions)) {
    throw new ForbiddenError('Nincs jogosultságod ehhez a művelethez.');
  }
  return user;
}

export async function requireAllPermissions(permissions: Permission[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!hasAllPermissions(toActor(user), permissions)) {
    throw new ForbiddenError('Nincs jogosultságod ehhez a művelethez.');
  }
  return user;
}

// ── Page-side guards ─────────────────────────────────────────────────────────

export async function ensureAuthenticated(returnTo?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    const target = returnTo ? `?next=${encodeURIComponent(returnTo)}` : '';
    redirect(`/belepes${target}`);
  }
  return user;
}

export async function ensureAdminAccess(returnTo = '/admin'): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/belepes?next=${encodeURIComponent(returnTo)}`);
  if (!canAccessAdmin(toActor(user))) redirect('/403');
  return user;
}

export async function ensurePermission(
  permission: Permission,
  returnTo = '/admin',
): Promise<SessionUser> {
  const user = await ensureAdminAccess(returnTo);
  if (!hasPermission(toActor(user), permission)) redirect('/403');
  return user;
}

/** Already-authenticated users should never see the login or register screen. */
export async function ensureGuest(redirectTo = '/'): Promise<void> {
  const user = await getCurrentUser();
  if (user) redirect(redirectTo);
}
