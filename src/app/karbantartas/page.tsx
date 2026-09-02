import type { Metadata } from 'next';
import { Logo } from '@/shared/layout/logo';
import { getPublicSettings } from '@/features/settings/service';

export const metadata: Metadata = {
  title: 'Karbantartás',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Maintenance screen.
 *
 * Deliberately outside the `(site)` route group, for two reasons.
 *
 * The first is fatal if you get it wrong: the site layout redirects visitors
 * here whenever maintenance mode is on. If this page lived inside that layout,
 * it would redirect to itself — an infinite loop, and the maintenance screen
 * would be the one page nobody could ever see.
 *
 * The second is defensive: if the database is what is being worked on, the
 * header and footer (which both read from it) are the parts most likely to
 * fail. This page needs nothing but the settings row.
 */
export default async function MaintenancePage() {
  const settings = await getPublicSettings();

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-6 py-20">
      <div aria-hidden className="aurora opacity-50" />
      <div aria-hidden className="noise absolute inset-0" />

      <div className="relative max-w-md text-center">
        <Logo size="lg" href={null} className="mx-auto" />

        <h1 className="mt-10 text-3xl">
          <span className="text-gradient">Karbantartás</span>
        </h1>

        <p className="mt-4 text-sm leading-relaxed text-content-muted">
          {settings.announcement ||
            'Éppen dolgozunk az oldalon. Hamarosan visszatérünk — a kiadások nem mennek sehova.'}
        </p>

        <p lang="ja" className="mt-8 font-jp text-xs tracking-[0.3em] text-mist-600">
          しばらくお待ちください
        </p>
      </div>
    </main>
  );
}
