import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Search } from 'lucide-react';
import { Logo } from '@/components/site/logo';
import { ButtonLink } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Az oldal nem található',
  robots: { index: false, follow: true },
};

/**
 * 404.
 *
 * Renders outside the site shell (Next mounts the root `not-found` without the
 * route-group layout), so it is self-contained — and it offers three concrete
 * ways onward rather than a dead end.
 */
export default function NotFound() {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-6 py-20">
      <div aria-hidden className="aurora opacity-40" />
      <div aria-hidden className="noise absolute inset-0" />

      <div className="relative max-w-lg text-center">
        <Logo size="lg" className="mx-auto" />

        <p className="nums mt-12 font-display text-7xl font-extrabold text-gradient sm:text-8xl">
          404
        </p>

        <h1 className="mt-4 text-2xl">Ez az oldal nincs meg</h1>

        <p className="mt-3 text-sm leading-relaxed text-content-muted">
          Lehet, hogy elírtuk a linket, lehet, hogy te — vagy a tartalom egyszerűen
          elköltözött. A katalógus és a kereső innen egy kattintás.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <ButtonLink
            href="/"
            variant="primary"
            size="md"
            leadingIcon={<ArrowLeft className="size-4" aria-hidden />}
          >
            Kezdőlap
          </ButtonLink>

          <ButtonLink
            href="/kereses"
            variant="outline"
            size="md"
            leadingIcon={<Search className="size-4" aria-hidden />}
          >
            Keresés
          </ButtonLink>
        </div>

        <p className="mt-10 text-2xs text-mist-600">
          Ha szerinted hibás link vezetett ide,{' '}
          <Link href="/kapcsolat" className="underline-offset-4 hover:text-mist-500 hover:underline">
            szólj nekünk
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
