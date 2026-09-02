import 'server-only';
import { redirect } from 'next/navigation';
import { canAccessAdmin, hasPermission, type Permission } from '@/shared/auth/permissions';
import { getSession, toActor, type SessionUser } from '@/shared/auth/session';

/**
 * Oldal- és elrendezés-szintű hozzáférés-ellenőrzés.
 *
 * Mindegyik **átirányít**, nem dob: egy oldal vagy egy layout esetén a helyes
 * kimenet böngésző-navigáció, nem JSON-hiba.
 *
 * Az API oldalán nincs párja, és ez szándékos. Ott a `defineRoute()` `auth`
 * mezője dönt, egyetlen helyen, a rate limit és a CSRF-ellenőrzés után —
 * korábban létezett itt egy `require*` családja ugyanennek, amit soha semmi
 * nem hívott. Egy második, párhuzamos jogosultsági API nem kényelem, hanem
 * kockázat: előbb-utóbb valaki azt használja, és nem veszi észre, hogy kimarad
 * belőle minden, amit a route-gyár körülötte csinál.
 */

export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await getSession();
  return session?.user ?? null;
}

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
