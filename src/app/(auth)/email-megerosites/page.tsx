import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, XCircle } from 'lucide-react';
import { verifyEmail } from '@/server/auth-service';
import { isAppError } from '@/lib/errors';
import { logger } from '@/lib/logger';

export const metadata: Metadata = {
  title: 'E-mail megerősítése',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ token?: string }>;

/**
 * Email verification landing page.
 *
 * Consumes the token server-side on load, so the user's only interaction is
 * clicking the link in their inbox — no second "confirm" button, which people
 * routinely fail to press and then report the link as broken.
 *
 * The trade-off is that a link-prescanning proxy can burn the token. That is
 * acceptable here (a fresh link is one click away, and the account is not yet
 * in a sensitive state), and is exactly why the *password reset* flow does the
 * opposite and waits for a form submission.
 */
export default async function VerifyEmailPage({ searchParams }: { searchParams: SearchParams }) {
  const { token } = await searchParams;

  if (!token) return <Result ok={false} message="A link nem tartalmaz megerősítő tokent." />;

  try {
    await verifyEmail(token);
    return <Result ok />;
  } catch (error) {
    if (!isAppError(error)) logger.error('Email verification failed unexpectedly', error);

    return (
      <Result
        ok={false}
        message={
          isAppError(error)
            ? error.message
            : 'A megerősítés most nem sikerült. Próbáld újra később.'
        }
      />
    );
  }
}

function Result({ ok, message }: { ok: boolean; message?: string }) {
  return (
    <div>
      <div
        className={
          ok
            ? 'mb-5 grid size-12 place-items-center rounded-2xl border border-success-500/30 bg-success-500/10 text-success-400'
            : 'mb-5 grid size-12 place-items-center rounded-2xl border border-danger-500/30 bg-danger-500/10 text-danger-400'
        }
      >
        {ok ? (
          <CheckCircle2 className="size-6" aria-hidden />
        ) : (
          <XCircle className="size-6" aria-hidden />
        )}
      </div>

      <h1 className="text-2xl">{ok ? 'Kész, megerősítve' : 'Nem sikerült megerősíteni'}</h1>

      <p className="mt-3 text-sm leading-relaxed text-content-muted">
        {ok
          ? 'Az e-mail-címed megerősítve, a fiókod aktív. Mostantól minden funkciót elérsz.'
          : (message ?? 'A megerősítő link érvénytelen vagy lejárt.')}
      </p>

      <div className="mt-7 flex flex-wrap gap-4 text-sm">
        <Link
          href={ok ? '/belepes?verified=1' : '/belepes'}
          className="font-medium text-bloom-300 underline-offset-4 hover:underline"
        >
          Bejelentkezés
        </Link>

        {!ok && (
          <Link href="/kapcsolat" className="text-mist-400 underline-offset-4 hover:underline">
            Segítséget kérek
          </Link>
        )}
      </div>
    </div>
  );
}
