import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ensureGuest } from '@/lib/auth/guards';
import { LoginForm } from '@/components/auth/login-form';
import { TextSkeleton } from '@/components/ui/feedback';

export const metadata: Metadata = {
  title: 'Bejelentkezés',
  description: 'Jelentkezz be a Yonagi Fansub fiókodba.',
  robots: { index: false, follow: true },
};

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  // Someone already signed in has no business on this screen.
  await ensureGuest('/');

  return (
    <Suspense fallback={<TextSkeleton lines={6} />}>
      <LoginForm />
    </Suspense>
  );
}
