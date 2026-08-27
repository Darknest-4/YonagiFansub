import type { Metadata } from 'next';
import Link from 'next/link';
import { ResetPasswordForm } from '@/components/auth/password-reset-forms';

export const metadata: Metadata = {
  title: 'Új jelszó beállítása',
  robots: { index: false, follow: false },
};

type Params = Promise<{ token: string }>;

/**
 * The token is only shape-checked here. Whether it is valid, unexpired and
 * unused is decided by the API when the form is submitted — checking it on load
 * would mean an extra database round trip that tells a link-scanner (email
 * previews, corporate proxies) whether a token is live, and those scanners
 * routinely fetch links before the human ever clicks them.
 */
export default async function ResetPasswordPage({ params }: { params: Params }) {
  const { token } = await params;

  if (!token || token.length < 20 || token.length > 200) {
    return (
      <div>
        <h1 className="text-2xl">Érvénytelen link</h1>
        <p className="mt-3 text-sm leading-relaxed text-content-muted">
          Ez a visszaállító link hibás vagy hiányos. Kérj újat — a régi linkek egy óra
          után lejárnak.
        </p>
        <Link
          href="/jelszo-visszaallitas"
          className="mt-6 inline-block text-sm font-medium text-tide-300 underline-offset-4 hover:underline"
        >
          Új link kérése
        </Link>
      </div>
    );
  }

  return <ResetPasswordForm token={token} />;
}
