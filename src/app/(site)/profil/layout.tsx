import { ensureAuthenticated } from '@/shared/auth/guards';
import { AccountNav } from '@/features/users/components/account-nav';
import { PageHeader } from '@/shared/layout/page-header';

/**
 * Account area shell.
 *
 * The guard runs in the layout, so every page under `/profil` is protected by
 * construction — a new page added here cannot forget to check the session.
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await ensureAuthenticated('/profil');

  return (
    <div className="container-content py-10 lg:py-14">
      <PageHeader
        eyebrow="Fiók"
        title={user.displayName}
        description={`@${user.username}`}
      />

      <div className="mt-9 grid gap-8 lg:grid-cols-[14rem_1fr] lg:gap-12">
        <AccountNav />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
