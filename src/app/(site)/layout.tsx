import { redirect } from 'next/navigation';
import { SiteHeader, type HeaderUser } from '@/components/site/header';
import { SiteFooter } from '@/components/site/footer';
import { getCurrentUser } from '@/lib/auth/guards';
import { canAccessAdmin } from '@/lib/auth/permissions';
import { countUnread } from '@/server/notifications';
import { getPublicSettings } from '@/server/settings';

/**
 * Public site shell.
 *
 * The header needs a small, purpose-built projection of the session rather than
 * the whole user object — nothing more than the shell renders should cross into
 * a client component.
 */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [user, settings] = await Promise.all([getCurrentUser(), getPublicSettings()]);

  // Maintenance mode locks the public site but leaves /admin reachable so the
  // team can finish whatever they are doing.
  if (settings.maintenanceMode && !(user && canAccessAdmin({
    id: user.id,
    roleKey: user.roleKey,
    roleRank: user.roleRank,
    permissions: user.permissions,
  }))) {
    redirect('/karbantartas');
  }

  const headerUser: HeaderUser | null = user
    ? {
        displayName: user.displayName,
        username: user.username,
        avatarUrl: user.avatarUrl,
        canAccessAdmin: canAccessAdmin({
          id: user.id,
          roleKey: user.roleKey,
          roleRank: user.roleRank,
          permissions: user.permissions,
        }),
        unreadCount: await countUnread(user.id),
      }
    : null;

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader
        user={headerUser}
        announcement={
          settings.announcement
            ? { text: settings.announcement, href: settings.announcementHref || undefined }
            : null
        }
      />

      <main id="main" className="flex-1">
        {children}
      </main>

      <SiteFooter />
    </div>
  );
}
