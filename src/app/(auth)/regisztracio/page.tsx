import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { ensureGuest } from '@/lib/auth/guards';
import { RegisterForm } from '@/components/auth/register-form';
import { TextSkeleton } from '@/components/ui/feedback';
import { getPublicSettings } from '@/server/settings';

export const metadata: Metadata = {
  title: 'Regisztráció',
  description: 'Hozz létre fiókot, hogy követhesd a projektjeidet és értesülj az új kiadásokról.',
  robots: { index: false, follow: true },
};

export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  await ensureGuest('/');
  const settings = await getPublicSettings();

  if (!settings.registrationOpen) {
    return (
      <div>
        <h1 className="text-2xl">A regisztráció szünetel</h1>
        <p className="mt-3 text-sm leading-relaxed text-content-muted">
          Jelenleg nem fogadunk új regisztrációkat. Ha van már fiókod, be tudsz lépni;
          ha kérdésed van, írj nekünk.
        </p>
        <div className="mt-6 flex gap-3 text-sm">
          <Link href="/belepes" className="font-medium text-tide-300 underline-offset-4 hover:underline">
            Bejelentkezés
          </Link>
          <Link href="/kapcsolat" className="text-mist-400 underline-offset-4 hover:underline">
            Kapcsolat
          </Link>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<TextSkeleton lines={8} />}>
      <RegisterForm />
    </Suspense>
  );
}
