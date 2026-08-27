import type { Metadata } from 'next';
import { Logo } from '@/components/site/logo';
import { getPublicSettings } from '@/server/settings';

export const metadata: Metadata = {
  title: 'Karbantartás',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * Maintenance screen.
 *
 * Rendered outside the site shell on purpose: if the database is what is being
 * worked on, the header and footer (which both read from it) are exactly the
 * parts most likely to fail. This page needs nothing but settings.
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

        <p className="mt-8 font-jp text-xs tracking-[0.3em] text-mist-700">しばらくお待ちください</p>
      </div>
    </main>
  );
}
