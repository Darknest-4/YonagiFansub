import type { Metadata } from 'next';
import { db } from '@/infrastructure/db';
import { ensureAdminAccess } from '@/shared/auth/guards';
import { AdminShell } from '@/shared/layout/admin-shell';

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s · Yonagi Admin' },
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = 'force-dynamic';

/**
 * Admin layout.
 *
 * `ensureAdminAccess` runs here, which means every page under `/admin` is gated
 * by construction. Individual pages still assert their own, narrower permission
 * — this only proves the actor may see the panel at all.
 *
 * The middleware's cookie check bounces anonymous visitors earlier, but it is an
 * optimisation, not the control: a forged cookie gets past the edge and dies
 * here, where the session is actually validated against the database.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await ensureAdminAccess();

  const canReadContact =
    user.permissions.includes('*') || user.permissions.includes('contact:read');
  const canModerate =
    user.permissions.includes('*') || user.permissions.includes('comment:moderate');

  const [contactCount, commentCount] = await Promise.all([
    canReadContact ? db.contactMessage.count({ where: { status: 'NEW' } }) : 0,
    canModerate ? db.comment.count({ where: { status: 'PENDING', deletedAt: null } }) : 0,
  ]);

  return (
    <AdminShell
      user={{
        displayName: user.displayName,
        username: user.username,
        avatarUrl: user.avatarUrl,
        roleName: user.roleName,
        roleColor: user.roleColor,
        permissions: user.permissions,
      }}
      badges={{ contact: contactCount, comments: commentCount }}
    >
      {children}
    </AdminShell>
  );
}
