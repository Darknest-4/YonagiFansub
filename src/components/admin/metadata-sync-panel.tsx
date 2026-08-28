'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { ApiError, apiFetch } from '@/lib/client/api';

interface SyncResult {
  sources: string[];
  episodesCreated: number;
  episodesUpdated: number;
  episodesSkipped: number;
  episodesTruncated: boolean;
  genresLinked: number;
}

/**
 * Metadata refresh for a project that already has an upstream id.
 *
 * Two buttons, because they are genuinely different operations and merging them
 * behind one would make the destructive one reachable by accident:
 *
 *   • **Frissítés** — the safe one. Refreshes upstream facts (scores, credits,
 *     air dates) and adds missing episodes. Anything the team wrote is left
 *     alone, so it is safe to press without thinking, which is the point.
 *   • **Teljes újraimportálás** — replaces the curated fields too. Behind a
 *     confirmation that names what it will overwrite, because "the synopsis I
 *     translated is gone" is not something to discover afterwards.
 */
export function MetadataSync({ projectId }: { projectId: string }) {
  const router = useRouter();
  const toast = useToast();

  const [pending, setPending] = useState<'refresh' | 'overwrite' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);

  const run = async (overwriteEditorial: boolean) => {
    setPending(overwriteEditorial ? 'overwrite' : 'refresh');
    try {
      const data = await apiFetch<SyncResult>(`/api/v1/admin/projects/${projectId}/sync`, {
        method: 'POST',
        body: { overwriteEditorial, skipEpisodes: false },
      });
      setResult(data);
      toast.success(
        `Frissítve — ${data.episodesCreated} új, ${data.episodesUpdated} módosított epizód`,
      );
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'A szinkronizálás nem sikerült.');
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="rounded-lg border border-ink-800 bg-ink-900/50 p-4">
      <p className="text-sm font-medium text-mist-100">Metaadat-szinkronizálás</p>
      <p className="mt-1 text-2xs leading-relaxed text-mist-500">
        A frissítés a pontszámokat, stábot és dátumokat hozza be, és felveszi a hiányzó
        epizódokat. A saját címeidet, szinopszisodat és borítódat nem írja felül.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          loading={pending === 'refresh'}
          disabled={pending !== null}
          onClick={() => run(false)}
          leadingIcon={<RefreshCw className="size-3.5" aria-hidden />}
        >
          Frissítés
        </Button>

        <Button
          variant="ghost"
          size="sm"
          disabled={pending !== null}
          onClick={() => setConfirming(true)}
        >
          Teljes újraimportálás
        </Button>
      </div>

      {result && (
        <dl className="nums mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-ink-800 pt-3 text-2xs text-mist-400">
          <span>
            <dt className="inline text-mist-600">Forrás:</dt>{' '}
            <dd className="inline">{result.sources.join(' + ') || '—'}</dd>
          </span>
          <span>
            <dt className="inline text-mist-600">Új epizód:</dt>{' '}
            <dd className="inline">{result.episodesCreated}</dd>
          </span>
          <span>
            <dt className="inline text-mist-600">Módosított:</dt>{' '}
            <dd className="inline">{result.episodesUpdated}</dd>
          </span>
          {result.episodesSkipped > 0 && (
            <span>
              <dt className="inline text-mist-600">Kihagyva (kézi):</dt>{' '}
              <dd className="inline">{result.episodesSkipped}</dd>
            </span>
          )}
        </dl>
      )}

      {result?.episodesTruncated && (
        <p className="mt-2 flex items-start gap-1.5 text-2xs text-ember-400">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
          Hosszú sorozat — a további epizódok a következő futáskor jönnek meg.
        </p>
      )}

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={async () => {
          setConfirming(false);
          await run(true);
        }}
        title="Teljes újraimportálás"
        description={
          <>
            Ez <strong className="text-mist-100">felülírja</strong> a projekt címét,
            szinopszisát, borítóját, bannerét és kiemelőszínét az AniList/MyAnimeList
            adataival. A munkafolyamat-állapotok, a publikálási állapot és a kézzel felvett
            epizódok érintetlenek maradnak.
          </>
        }
        confirmLabel="Felülírom"
      />
    </div>
  );
}
