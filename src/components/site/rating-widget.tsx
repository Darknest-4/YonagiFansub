'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { ApiError, apiFetch } from '@/lib/client/api';

/**
 * The audience's own score, next to the imported ones.
 *
 * The project page already shows what AniList and MyAnimeList think. What was
 * missing is the opinion that actually tells this team what to pick up next —
 * their own readers'.
 *
 * ## Ten buttons, not five stars
 *
 * A ten-point scale matches what every anime database uses, so a viewer does not
 * have to translate their own habits. Half-stars would be the alternative and
 * they are a worse control: harder to hit on a phone, and ambiguous to read
 * back.
 *
 * ## Optimistic, and honest about it
 *
 * The score paints immediately and rolls back if the request fails, because a
 * rating that waits on a round trip feels broken. What is *not* optimistic is
 * the average: recomputing it in the browser would show a number that disagrees
 * with the server's for as long as it takes to answer, so it comes back from
 * the response instead.
 */

const SCALE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export interface RatingState {
  average: number | null;
  count: number;
  mine: number | null;
}

export function RatingWidget({
  projectId,
  projectSlug,
  initial,
  canRate,
  isAuthenticated,
}: {
  projectId: string;
  projectSlug: string;
  initial: RatingState;
  /** False for a signed-in account that has not confirmed its address. */
  canRate: boolean;
  isAuthenticated: boolean;
}) {
  const toast = useToast();
  const [state, setState] = useState(initial);
  const [hover, setHover] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (score: number) => {
    if (busy) return;

    // Clicking your own score again withdraws it — the only way back to
    // "no opinion" without a second control taking up space.
    const next = state.mine === score ? null : score;
    const previous = state;

    setState((current) => ({ ...current, mine: next }));
    setBusy(true);

    try {
      const summary = await apiFetch<RatingState>(`/api/v1/ratings/${projectId}`, {
        method: next === null ? 'DELETE' : 'PUT',
        ...(next === null ? {} : { body: { score: next } }),
      });
      setState(summary);
    } catch (error) {
      setState(previous);
      toast.error(
        'Nem sikerült menteni',
        error instanceof ApiError ? error.message : 'Próbáld újra később.',
      );
    } finally {
      setBusy(false);
    }
  };

  const shown = hover ?? state.mine ?? 0;

  return (
    <section aria-labelledby="rating">
      <h2
        id="rating"
        className="mb-3 text-2xs font-bold tracking-[0.18em] text-mist-500 uppercase"
      >
        Értékeld te is
      </h2>

      <div className="rounded-xl border border-ink-800 bg-ink-900/40 px-4 py-3.5">
        {state.count > 0 ? (
          <p className="mb-3 flex items-baseline gap-2">
            <span className="nums text-2xl font-bold text-mist-50">
              {state.average?.toFixed(1).replace('.', ',')}
            </span>
            <span className="text-2xs text-mist-500">
              {state.count} értékelés alapján
            </span>
          </p>
        ) : (
          <p className="mb-3 text-sm text-mist-500">Még senki nem értékelte.</p>
        )}

        {canRate ? (
          <>
            <div
              className="flex flex-wrap gap-1"
              onMouseLeave={() => setHover(null)}
              role="group"
              aria-label="Pontszám 1-től 10-ig"
            >
              {SCALE.map((score) => (
                <button
                  key={score}
                  type="button"
                  disabled={busy}
                  onClick={() => void submit(score)}
                  onMouseEnter={() => setHover(score)}
                  onFocus={() => setHover(score)}
                  onBlur={() => setHover(null)}
                  aria-pressed={state.mine === score}
                  aria-label={`${score} pont`}
                  className={cn(
                    // 32px minimum: ten targets have to fit a phone without
                    // becoming a row of things you cannot reliably hit.
                    'grid size-8 place-items-center rounded-md border text-2xs font-semibold transition-colors duration-fast',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bloom-400',
                    'disabled:cursor-not-allowed disabled:opacity-60',
                    score <= shown
                      ? 'border-bloom-500/50 bg-bloom-500/20 text-bloom-200'
                      : 'border-ink-700 text-mist-500 hover:border-ink-600 hover:text-mist-200',
                  )}
                >
                  {score}
                </button>
              ))}
            </div>

            <p className="mt-2.5 flex items-center gap-1.5 text-2xs text-mist-600">
              <Star className="size-3 shrink-0" aria-hidden />
              {state.mine
                ? `A te pontszámod: ${state.mine}. Kattints rá újra a visszavonáshoz.`
                : 'Válassz egy pontszámot.'}
            </p>
          </>
        ) : (
          <p className="text-2xs leading-relaxed text-mist-500">
            {isAuthenticated ? (
              <>
                Az értékeléshez erősítsd meg az e-mail-címed a{' '}
                <Link
                  href="/profil/beallitasok"
                  className="text-bloom-300 underline-offset-4 hover:underline"
                >
                  fiókbeállításokban
                </Link>
                .
              </>
            ) : (
              <>
                <Link
                  href={`/belepes?next=${encodeURIComponent(`/projektek/${projectSlug}`)}`}
                  className="text-bloom-300 underline-offset-4 hover:underline"
                >
                  Lépj be
                </Link>{' '}
                az értékeléshez.
              </>
            )}
          </p>
        )}
      </div>
    </section>
  );
}
