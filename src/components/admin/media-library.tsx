'use client';

import Image from 'next/image';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check, Copy, ImageOff, Trash2, Upload } from 'lucide-react';
import { cn, formatBytes, formatRelative } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState, Skeleton } from '@/components/ui/feedback';
import { Input, Select } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { ApiError, apiFetch } from '@/lib/client/api';

export interface MediaAssetView {
  id: string;
  key: string;
  url: string;
  mimeType: string;
  sizeBytes: string;
  width: number | null;
  height: number | null;
  alt: string | null;
  folder: string;
  createdAt: string;
  uploadedBy: { username: string; displayName: string } | null;
}

export const MEDIA_FOLDER_LABELS: Record<string, string> = {
  general: 'Általános',
  projects: 'Projektek',
  episodes: 'Epizódok',
  news: 'Hírek',
  team: 'Csapat',
};

interface ListResponse {
  items: MediaAssetView[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
}

/**
 * Media library.
 *
 * One component serves two jobs, because they are the same interface: the
 * `/admin/media` page renders it inline, and every image field opens it in a
 * modal with `onPick` set. Splitting it would mean two grids, two upload paths
 * and two places to fix a bug.
 *
 * Uploads are optimistic about nothing: the tile appears only after the server
 * has stored the bytes and answered with a real URL, because the alternative is
 * a preview that survives a failed upload and gets saved into a form as a
 * blob: URL that dies with the tab.
 */
export function MediaLibrary({
  folder,
  onPick,
  canDelete = false,
  className,
}: {
  /** Pre-selects the upload target and the filter; the user can still change it. */
  folder?: string;
  onPick?: (asset: MediaAssetView) => void;
  canDelete?: boolean;
  className?: string;
}) {
  const toast = useToast();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<MediaAssetView[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [deleting, setDeleting] = useState<MediaAssetView | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeFolder, setActiveFolder] = useState(folder ?? '');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<ListResponse['meta'] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), perPage: '24' });
      if (activeFolder) params.set('folder', activeFolder);
      if (query.trim()) params.set('q', query.trim());

      const result = await apiFetch<ListResponse>(`/api/v1/admin/media?${params}`);
      setItems(result.items);
      setMeta(result.meta);
    } catch (error) {
      toast.error('A médiatár nem tölthető be', error instanceof Error ? error.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [activeFolder, page, query, toast]);

  useEffect(() => {
    // Debounced so typing in the search box does not fire a request per keystroke.
    const timer = setTimeout(() => void load(), query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, query]);

  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;

    setUploading(true);
    let stored = 0;
    let duplicates = 0;

    try {
      for (const file of list) {
        const form = new FormData();
        form.append('file', file);
        form.append('folder', activeFolder || folder || 'general');

        try {
          const result = await apiFetch<{ asset: MediaAssetView; deduplicated: boolean }>(
            '/api/v1/admin/media',
            { method: 'POST', body: form, raw: true },
          );
          if (result.deduplicated) duplicates += 1;
          else stored += 1;
        } catch (error) {
          const message =
            error instanceof ApiError ? error.message : 'A feltöltés nem sikerült.';
          toast.error(file.name, message);
        }
      }

      if (stored > 0) toast.success(`${stored} fájl feltöltve`);
      if (duplicates > 0) {
        toast.info(
          duplicates === 1 ? 'Egy fájl már a tárban volt' : `${duplicates} fájl már a tárban volt`,
          'A meglévő példányt használjuk, nem készült másolat.',
        );
      }
      if (stored > 0 || duplicates > 0) {
        setPage(1);
        await load();
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await apiFetch(`/api/v1/admin/media/${deleting.id}`, { method: 'DELETE' });
      toast.success('Médiafájl törölve');
      setItems((current) => current.filter((item) => item.id !== deleting.id));
    } catch (error) {
      toast.error('A törlés nem sikerült', error instanceof Error ? error.message : undefined);
    } finally {
      setDeleting(null);
    }
  };

  const copyUrl = async (asset: MediaAssetView) => {
    try {
      await navigator.clipboard.writeText(asset.url);
      setCopiedId(asset.id);
      setTimeout(() => setCopiedId((current) => (current === asset.id ? null : current)), 1600);
    } catch {
      toast.error('A vágólap nem érhető el', 'Másold ki kézzel az URL-t.');
    }
  };

  return (
    <div className={cn('space-y-5', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
          placeholder="Keresés leírás vagy fájlnév szerint…"
          inputSize="sm"
          className="min-w-48 flex-1"
          aria-label="Keresés a médiatárban"
        />

        <Select
          value={activeFolder}
          onChange={(event) => {
            setActiveFolder(event.target.value);
            setPage(1);
          }}
          selectSize="sm"
          aria-label="Mappa"
          className="w-40"
        >
          <option value="">Minden mappa</option>
          {Object.entries(MEDIA_FOLDER_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>

        <Button
          size="sm"
          variant="primary"
          leadingIcon={<Upload className="size-4" aria-hidden />}
          loading={uploading}
          onClick={() => inputRef.current?.click()}
        >
          Feltöltés
        </Button>

        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
          multiple
          className="sr-only"
          onChange={(event) => {
            if (event.target.files) void upload(event.target.files);
          }}
        />
      </div>

      {/*
        The drop zone wraps the grid rather than sitting above it: a person
        dragging a file aims at the collection they want it to join, not at a
        separate strip of dashed border.
      */}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (event.dataTransfer.files.length > 0) void upload(event.dataTransfer.files);
        }}
        className={cn(
          'rounded-xl border border-dashed p-4 transition-colors duration-fast',
          dragging ? 'border-tide-400/70 bg-tide-400/5' : 'border-ink-800 bg-transparent',
        )}
      >
        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {Array.from({ length: 12 }, (_, index) => (
              <Skeleton key={index} className="aspect-square rounded-lg" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<ImageOff className="size-6" aria-hidden />}
            title={query || activeFolder ? 'Nincs találat' : 'A médiatár üres'}
            description={
              query || activeFolder
                ? 'Próbáld más kifejezéssel, vagy válts mappát.'
                : 'Húzz ide képeket, vagy használd a Feltöltés gombot. PNG, JPEG, WebP, GIF és AVIF, fájlonként legfeljebb 8 MB.'
            }
          />
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {items.map((asset) => (
              <MediaTile
                key={asset.id}
                asset={asset}
                copied={copiedId === asset.id}
                onPick={onPick}
                onCopy={() => void copyUrl(asset)}
                onDelete={canDelete ? () => setDeleting(asset) : undefined}
              />
            ))}
          </ul>
        )}
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 text-xs text-mist-500">
          <span className="nums">
            {meta.total} fájl · {meta.page}. oldal a(z) {meta.totalPages}-ből
          </span>
          <div className="flex gap-2">
            <Button
              size="xs"
              variant="subtle"
              disabled={meta.page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Előző
            </Button>
            <Button
              size="xs"
              variant="subtle"
              disabled={meta.page >= meta.totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Következő
            </Button>
          </div>
        </div>
      )}

      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        dismissible={false}
        size="sm"
        title="Médiafájl törlése"
        description="A fájl véglegesen törlődik a tárolóból. Ha egy projekt vagy hír még hivatkozik rá, ott törött kép marad."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Mégse
            </Button>
            <Button variant="danger" onClick={() => void confirmDelete()}>
              Végleges törlés
            </Button>
          </>
        }
      >
        {deleting && (
          <p className="text-sm break-all text-mist-300">
            <code className="text-xs">{deleting.key}</code>
          </p>
        )}
      </Modal>
    </div>
  );
}

function MediaTile({
  asset,
  copied,
  onPick,
  onCopy,
  onDelete,
}: {
  asset: MediaAssetView;
  copied: boolean;
  onPick?: (asset: MediaAssetView) => void;
  onCopy: () => void;
  onDelete?: () => void;
}) {
  const dimensions = asset.width && asset.height ? `${asset.width}×${asset.height}` : null;

  return (
    <li className="group relative overflow-hidden rounded-lg border border-ink-800 bg-ink-900/60">
      <div className="relative aspect-square bg-ink-850">
        <Image
          src={asset.url}
          alt={asset.alt ?? ''}
          fill
          sizes="(min-width: 1280px) 16vw, (min-width: 640px) 33vw, 50vw"
          className="object-cover"
          unoptimized={asset.mimeType === 'image/gif'}
        />

        {/*
          The action layer is always in the DOM and always focusable — revealing
          controls on hover alone would hide them from keyboard and touch users.
        */}
        <div
          className={cn(
            'absolute inset-0 flex flex-col justify-between bg-ink-950/70 p-2 opacity-0',
            'transition-opacity duration-fast group-hover:opacity-100 focus-within:opacity-100',
          )}
        >
          <div className="flex justify-end gap-1">
            <Button
              size="icon-sm"
              variant="subtle"
              onClick={onCopy}
              aria-label={`${asset.key} URL másolása`}
            >
              {copied ? (
                <Check className="size-4 text-success-400" aria-hidden />
              ) : (
                <Copy className="size-4" aria-hidden />
              )}
            </Button>
            {onDelete && (
              <Button
                size="icon-sm"
                variant="danger"
                onClick={onDelete}
                aria-label={`${asset.key} törlése`}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            )}
          </div>

          {onPick && (
            <Button size="xs" variant="primary" fullWidth onClick={() => onPick(asset)}>
              Kiválasztás
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-0.5 p-2">
        <p className="truncate text-2xs text-mist-300" title={asset.alt ?? asset.key}>
          {asset.alt ?? asset.key.split('/').pop()}
        </p>
        <p className="nums truncate text-2xs text-mist-600">
          {formatBytes(asset.sizeBytes)}
          {dimensions && ` · ${dimensions}`}
          {` · ${formatRelative(asset.createdAt)}`}
        </p>
      </div>
    </li>
  );
}
