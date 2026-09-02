import { redirect } from 'next/navigation';
import { SiteHeader, type HeaderUser } from '@/app/_shell/header';
import { SiteFooter } from '@/app/_shell/footer';
import { BetaBanner } from '@/app/_shell/beta-banner';
import { disabledNavFeatures } from '@/app/_shell/nav-config';
import { getCurrentUser } from '@/shared/auth/guards';
import { canAccessAdmin } from '@/shared/auth/permissions';
import { countUnread } from '@/features/notifications/service';
import { getPublicSettings } from '@/features/settings/service';

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
      {/*
        Above the header rather than inside it. The header is `sticky`, and a
        beta notice that follows you down every page is nagging; this one says
        its piece at the top and then scrolls away, which is the same treatment
        the announcement bar gets.
      */}
      {settings.betaMode && (
        <BetaBanner
          message={settings.betaMessage ?? ''}
          feedbackUrl={settings.betaFeedbackUrl ?? ''}
        />
      )}

      <SiteHeader
        user={headerUser}
        disabledNav={disabledNavFeatures(settings)}
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
