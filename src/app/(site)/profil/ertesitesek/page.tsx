import type { Metadata } from 'next';
import { BellOff } from 'lucide-react';
import { ensureAuthenticated } from '@/lib/auth/guards';
import { listNotifications } from '@/server/notifications';
import { EmptyState } from '@/components/ui/feedback';
import { NotificationList } from '@/components/account/notification-list';

export const metadata: Metadata = {
  title: 'Értesítések',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const user = await ensureAuthenticated('/profil/ertesitesek');
  const notifications = await listNotifications(user.id, { limit: 50 });

  if (notifications.length === 0) {
    return (
      <EmptyState
        icon={<BellOff className="size-6" aria-hidden />}
        title="Nincs értesítésed"
        description="Ha követsz projekteket, itt jelennek meg az új részek és a válaszok a hozzászólásaidra."
        action={{ label: 'Projektek böngészése', href: '/projektek' }}
      />
    );
  }

  return (
    <NotificationList
      initialItems={notifications.map((notification) => ({
        ...notification,
        createdAt: notification.createdAt.toISOString(),
        readAt: notification.readAt?.toISOString() ?? null,
      }))}
    />
  );
}
