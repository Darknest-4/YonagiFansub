'use client';

import { useEffect } from 'react';
import { RotateCcw } from 'lucide-react';
import { Logo } from '@/components/site/logo';
import { Button, ButtonLink } from '@/components/ui/button';

/**
 * Route-level error boundary.
 *
 * Next passes a `digest` for server-side errors: it is the only safe handle a
 * user can quote, since the real message never leaves the server. Showing it
 * turns "the site broke" into a report we can actually trace in the logs.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The server has already logged this; this is the client-side breadcrumb.
    console.error('Route error boundary caught:', error);
  }, [error]);

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-6 py-20">
      <div aria-hidden className="aurora opacity-30" />

      <div className="relative max-w-lg text-center">
        <Logo size="lg" className="mx-auto" />

        <h1 className="mt-12 text-2xl">Valami félrement</h1>

        <p className="mt-3 text-sm leading-relaxed text-content-muted">
          Váratlan hiba történt az oldal betöltése közben. A hibát automatikusan
          naplóztuk — próbáld újra, gyakran elég.
        </p>

        {error.digest && (
          <p className="mt-5 inline-block rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 font-mono text-2xs text-mist-500">
            Hibaazonosító: {error.digest}
          </p>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button
            variant="primary"
            size="md"
            onClick={reset}
            leadingIcon={<RotateCcw className="size-4" aria-hidden />}
          >
            Újrapróbálom
          </Button>

          <ButtonLink href="/" variant="ghost" size="md">
            Kezdőlap
          </ButtonLink>
        </div>
      </div>
    </main>
  );
}
