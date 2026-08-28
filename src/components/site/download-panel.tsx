'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  ExternalLink,
  Magnet,
  Play,
  Server,
} from 'lucide-react';
import { cn, formatBytes, formatDuration } from '@/lib/utils';
import { Badge, LINK_KIND_LABEL, RESOLUTION_LABEL } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { ApiError, apiFetch } from '@/lib/client/api';

/**
 * Download panel.
 *
 * Every release the episode has, each with its mirrors. Two details matter:
 *
 *   1. Links are *resolved*, not rendered. The href is an API route that records
 *      the download and redirects; the real URL never appears in the HTML. That
 *      keeps the statistics honest and lets a dead mirror be swapped centrally.
 *   2. Offline mirrors are shown, disabled and labelled rather than hidden.
 *      A user who knows a mirror exists and cannot find it assumes the site is
 *      broken; one who sees it marked offline just picks another.
 */

export interface DownloadLinkView {
  id: string;
  kind: 'DIRECT' | 'TORRENT' | 'MAGNET' | 'STREAM';
  label: string | null;
  isMirror: boolean;
  availability: 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'UNCHECKED';
  downloadCount: number;
  host: { key: string; name: string; iconUrl: string | null } | null;
}

export interface ReleaseView {
  id: string;
  kind: string;
  version: number;
  resolution: keyof typeof RESOLUTION_LABEL;
  videoCodec: string | null;
  audioCodec: string | null;
  subtitleFormat: string | null;
  fileSizeBytes: string | bigint | null;
  durationSec: number | null;
  crc32: string | null;
  sha256: string | null;
  changelog: string | null;
  notes: string | null;
  format: { key: string; label: string; container: string; isSoftsub: boolean } | null;
  links: DownloadLinkView[];
}

const KIND_ICON = {
  DIRECT: Download,
  TORRENT: Server,
  MAGNET: Magnet,
  STREAM: Play,
} as const;

export function DownloadPanel({ releases }: { releases: ReleaseView[] }) {
  const [activeId, setActiveId] = useState(releases[0]?.id ?? '');
  const active = releases.find((release) => release.id === activeId) ?? releases[0];

  if (!active) return null;

  return (
    <section aria-labelledby="downloads" className="rounded-2xl border border-ink-800 bg-ink-900/50">
      <header className="border-b border-ink-800 px-5 py-4">
        <h2 id="downloads" className="text-base font-semibold text-mist-50">
          Letöltés
        </h2>
        <p className="mt-1 text-xs text-content-muted">
          Válaszd ki a kiadást, majd a neked megfelelő tükröt.
        </p>
      </header>

      {releases.length > 1 && (
        <div
          role="tablist"
          aria-label="Elérhető kiadások"
          className="flex gap-1.5 overflow-x-auto border-b border-ink-800 px-4 py-3"
        >
          {releases.map((release) => {
            const selected = release.id === active.id;
            return (
              <button
                key={release.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveId(release.id)}
                className={cn(
                  'shrink-0 rounded-lg px-3.5 py-2 font-mono text-2xs font-medium transition-colors duration-fast',
                  selected
                    ? 'bg-bloom-400/15 text-bloom-200 ring-1 ring-bloom-400/35'
                    : 'bg-ink-850 text-mist-400 hover:bg-ink-800 hover:text-mist-200',
                )}
              >
                {RESOLUTION_LABEL[release.resolution]}
                {release.format ? ` · ${release.format.container.toUpperCase()}` : ''}
                {release.version > 1 ? ` v${release.version}` : ''}
              </button>
            );
          })}
        </div>
      )}

      <div className="px-5 py-5">
        <ReleaseSpec release={active} />

        {active.changelog && active.version > 1 && (
          <div className="mt-4 rounded-lg border border-orchid-400/25 bg-orchid-400/8 p-3.5">
            <p className="mb-1 text-2xs font-semibold tracking-wide text-orchid-300 uppercase">
              Változások a v{active.version} kiadásban
            </p>
            <p className="text-sm leading-relaxed text-mist-300">{active.changelog}</p>
          </div>
        )}

        {active.notes && (
          <p className="mt-4 text-sm leading-relaxed text-mist-400">{active.notes}</p>
        )}

        <ul className="mt-5 space-y-2">
          {active.links.map((link) => (
            <li key={link.id}>
              <DownloadRow link={link} />
            </li>
          ))}
          {active.links.length === 0 && (
            <li className="rounded-lg border border-dashed border-ink-700 px-4 py-6 text-center text-sm text-mist-500">
              Ehhez a kiadáshoz még nincs feltöltve letöltési link.
            </li>
          )}
        </ul>
      </div>
    </section>
  );
}

function ReleaseSpec({ release }: { release: ReleaseView }) {
  const rows: Array<[string, string | null]> = [
    ['Felbontás', RESOLUTION_LABEL[release.resolution]],
    ['Konténer', release.format?.container.toUpperCase() ?? null],
    ['Videó', release.videoCodec],
    ['Hang', release.audioCodec],
    ['Felirat', release.format?.isSoftsub ? `${release.subtitleFormat ?? 'ASS'} (soft)` : 'Beégetett'],
    ['Méret', release.fileSizeBytes ? formatBytes(BigInt(release.fileSizeBytes)) : null],
    ['Hossz', release.durationSec ? formatDuration(release.durationSec) : null],
    ['CRC32', release.crc32],
  ];

  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
      {rows
        .filter(([, value]) => Boolean(value))
        .map(([label, value]) => (
          <div key={label}>
            <dt className="text-2xs tracking-wide text-mist-500 uppercase">{label}</dt>
            <dd className="mt-0.5 font-mono text-xs text-mist-200">{value}</dd>
          </div>
        ))}
    </dl>
  );
}

function DownloadRow({ link }: { link: DownloadLinkView }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const Icon = KIND_ICON[link.kind];

  const offline = link.availability === 'OFFLINE';
  const degraded = link.availability === 'DEGRADED';

  const start = async () => {
    if (offline) return;
    setBusy(true);
    try {
      const { url } = await apiFetch<{ url: string }>(
        `/api/v1/downloads/${link.id}/resolve`,
        { method: 'POST' },
      );

      if (link.kind === 'MAGNET') {
        // Magnet links must not be opened in a new tab: the browser would leave
        // a blank window behind after handing off to the torrent client.
        window.location.href = url;
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      toast.error(
        'A letöltés nem indítható',
        error instanceof ApiError ? error.message : 'Próbáld meg egy másik tükörrel.',
      );
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      const { url } = await apiFetch<{ url: string }>(
        `/api/v1/downloads/${link.id}/resolve`,
        { method: 'POST' },
      );
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Link a vágólapra másolva');
    } catch {
      toast.error('Nem sikerült a másolás');
    }
  };

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border px-3.5 py-3 transition-colors duration-fast',
        offline
          ? 'border-ink-850 bg-ink-900/30 opacity-60'
          : 'border-ink-800 bg-ink-900/60 hover:border-bloom-400/30',
      )}
    >
      <span
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-md',
          offline ? 'bg-ink-850 text-mist-600' : 'bg-ink-850 text-bloom-300',
        )}
        aria-hidden
      >
        <Icon className="size-4" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-mist-100">
          {link.host?.name ?? link.label ?? LINK_KIND_LABEL[link.kind]}
          {link.isMirror && <Badge size="sm">Tükör</Badge>}
          {degraded && (
            <Badge tone="warning" size="sm" icon={<AlertTriangle className="size-3" aria-hidden />}>
              Lassú
            </Badge>
          )}
          {offline && (
            <Badge tone="danger" size="sm">
              Nem elérhető
            </Badge>
          )}
        </p>
        <p className="nums mt-0.5 text-2xs text-mist-500">
          {LINK_KIND_LABEL[link.kind]}
          {link.downloadCount > 0 && ` · ${link.downloadCount} letöltés`}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={copy}
          disabled={offline}
          aria-label="Link másolása"
          className="rounded-md p-2 text-mist-500 transition-colors hover:bg-ink-800 hover:text-mist-200 disabled:pointer-events-none disabled:opacity-40"
        >
          {copied ? (
            <Check className="size-4 text-success-400" aria-hidden />
          ) : (
            <Copy className="size-4" aria-hidden />
          )}
        </button>

        <Button
          variant={offline ? 'ghost' : 'primary'}
          size="sm"
          onClick={start}
          loading={busy}
          disabled={offline}
          trailingIcon={<ExternalLink className="size-3.5" aria-hidden />}
        >
          {link.kind === 'STREAM' ? 'Megnyitás' : 'Letöltés'}
        </Button>
      </div>
    </div>
  );
}
