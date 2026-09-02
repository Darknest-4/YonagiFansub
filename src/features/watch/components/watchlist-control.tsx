'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Bookmark, Check, CircleSlash, Eye, Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useToast } from '@/shared/ui/toast';
import { ApiError, apiFetch } from '@/shared/api/client';
import { WATCHLIST_LABELS, type WatchlistStatus } from '@/features/watch/watchlist-rules';

/**
 * A nézési lista kapcsolója a projektoldalon.
 *
 * ## Két gomb, négy állapot
 *
 * Csak a „tervezett" és az „elhagyott" kapcsolható — a „nézem" és a
 * „befejezett" a nézési előrehaladásból következik, és egy gomb, amivel
 * beállíthatnád, hazugság lenne: a következő megnézett rész úgyis felülírná.
 * Ezért ez a kettő csak *jelzésként* jelenik meg, gomb nélkül.
 *
 * ## A szerver mondja meg, mi lett belőle
 *
 * A kérés a kért jelölést küldi, a válasz viszont a **kiszámolt** állapotot
 * hozza vissza, és a felület azt mutatja. Aki egy már elkezdett sorozatot
 * jelöl tervezettnek, azonnal látja, hogy „nézem" lett — magyarázat nélkül is
 * érthetően, mert a szabály maga logikus. Optimista frissítés itt épp ezért
 * nem lenne jó: a helyi találgatás eltérne attól, amit a lista mutat.
 */
export function WatchlistControl({
  projectId,
  projectSlug,
  initialStatus,
  initialMark,
  isAuthenticated,
}: {
  projectId: string;
  projectSlug: string;
  initialStatus: WatchlistStatus | null;
  initialMark: 'PLANNED' | 'DROPPED' | null;
  isAuthenticated: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [status, setStatus] = useState(initialStatus);
  const [mark, setMark] = useState(initialMark);
  const [busy, setBusy] = useState<'PLANNED' | 'DROPPED' | null>(null);

  const send = async (kind: 'PLANNED' | 'DROPPED') => {
    if (!isAuthenticated) {
      router.push(`/belepes?next=${encodeURIComponent(`/projektek/${projectSlug}`)}`);
      return;
    }
    if (busy) return;

    // Ugyanarra a gombra koppintva a jelölés visszavonódik.
    const next = mark === kind ? null : kind;
    setBusy(kind);

    try {
      const result = await apiFetch<{
        status: WatchlistStatus | null;
        mark: 'PLANNED' | 'DROPPED' | null;
      }>(`/api/v1/watchlist/${projectId}`, { method: 'PUT', body: { kind: next } });

      setStatus(result.status);
      setMark(result.mark);

      toast.success(
        result.status ? `A listádon: ${WATCHLIST_LABELS[result.status]}` : 'Levéve a listádról',
      );
      router.refresh();
    } catch (error) {
      toast.error(
        'Nem sikerült',
        error instanceof ApiError ? error.message : 'Próbáld újra néhány másodperc múlva.',
      );
    } finally {
      setBusy(null);
    }
  };

  /*
    A kiszámolt állapotok jelzése.

    Csak akkor jelenik meg, ha tényleg az a helyzet — és akkor elmagyarázza,
    honnan tudjuk. „Nézem" felirat magyarázat nélkül azt a kérdést szülné, hogy
    ezt ki állította be.
  */
  const derived =
    status === 'WATCHING' || status === 'COMPLETED'
      ? {
          icon: status === 'COMPLETED' ? Check : Eye,
          label: WATCHLIST_LABELS[status],
          note:
            status === 'COMPLETED'
              ? 'Minden megjelent részt megnéztél.'
              : 'A megnézett részekből következik.',
        }
      : null;

  return (
    <section aria-labelledby="watchlist" className="rounded-2xl border border-ink-800 bg-ink-900/50 p-4">
      <h2 id="watchlist" className="text-2xs font-bold tracking-[0.18em] text-mist-500 uppercase">
        Nézési listám
      </h2>

      {derived && (
        <p className="mt-3 flex items-center gap-2 rounded-lg bg-ink-850 px-3 py-2 text-sm text-mist-100">
          <derived.icon className="size-4 shrink-0 text-bloom-400" aria-hidden />
          <span>
            <strong className="font-semibold">{derived.label}</strong>
            <span className="block text-2xs text-mist-500">{derived.note}</span>
          </span>
        </p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <MarkButton
          active={mark === 'PLANNED'}
          busy={busy === 'PLANNED'}
          icon={Bookmark}
          label="Tervezett"
          onClick={() => void send('PLANNED')}
        />
        <MarkButton
          active={mark === 'DROPPED'}
          busy={busy === 'DROPPED'}
          icon={CircleSlash}
          label="Elhagytam"
          onClick={() => void send('DROPPED')}
        />
      </div>

      <p className="mt-2.5 text-2xs leading-relaxed text-mist-600">
        A „nézem” és a „befejezett” magától áll be aszerint, hol tartasz — ezt a
        kettőt nem kell bejelölnöd.
      </p>
    </section>
  );
}

function MarkButton({
  active,
  busy,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  busy: boolean;
  icon: typeof Bookmark;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-pressed={active}
      className={cn(
        // 44px a minimális magasság: ez az, amit egy hüvelykujj megbízhatóan eltalál.
        'flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-3 py-2',
        'text-xs font-medium transition-colors duration-fast',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bloom-400',
        'disabled:opacity-60',
        active
          ? 'border-bloom-400/50 bg-bloom-500/12 text-bloom-200'
          : 'border-ink-700 bg-ink-900 text-mist-300 hover:border-ink-600 hover:text-mist-100',
      )}
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Icon className="size-4" aria-hidden />
      )}
      {label}
    </button>
  );
}
