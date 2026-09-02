import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Logo } from '@/shared/ui/logo';
import { AuthShowcase } from '@/features/auth/components/auth-showcase';

/**
 * Authentication shell.
 *
 * A two-pane layout: the form on the left at a comfortable reading width, and a
 * showcase panel on the right that only appears from `lg` up. The showcase is
 * decorative — on a phone it would be a wall of pixels between the user and the
 * password field, so it simply does not render there.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative flex flex-col px-5 py-8 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between gap-4">
          <Logo />

          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-mist-500 transition-colors hover:text-bloom-300"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Vissza az oldalra
          </Link>
        </header>

        <main id="main" className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </main>

        <footer className="text-center text-2xs text-mist-600">
          © {new Date().getFullYear()} Yonagi Fansub ·{' '}
          <Link href="/adatkezeles" className="underline-offset-4 hover:text-mist-500 hover:underline">
            Adatkezelés
          </Link>
        </footer>
      </div>

      <AuthShowcase />
    </div>
  );
}
