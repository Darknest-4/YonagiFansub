'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Eye, Film, Lock, Plus, Trash2 } from 'lucide-react';
import { formatDuration } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Switch } from '@/components/ui/field';
import { InlineError } from '@/components/ui/feedback';
import { ConfirmDialog, Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { ApiError, apiFetch, type FieldErrors } from '@/lib/client/api';

interface VideoRow {
  id: string;
  masterKey: string;
  label: string | null;
  resolution: string;
  durationSec: number | null;
  requiresAuth: boolean;
  status: string;
  viewCount: number;
}

const RESOLUTIONS = [
  { value: 'SD_480P', label: '480p' },
  { value: 'HD_720P', label: '720p' },
  { value: 'FHD_1080P', label: '1080p' },
  { value: 'QHD_1440P', label: '1440p' },
  { value: 'UHD_2160P', label: '2160p' },
];

const STATUSES = [
  { value: 'DRAFT', label: 'Piszkozat' },
  { value: 'PUBLISHED', label: 'Publikált' },
  { value: 'ARCHIVED', label: 'Archivált' },
];

interface Draft {
  masterKey: string;
  label: string;
  resolution: string;
  durationSec: string;
  requiresAuth: boolean;
  status: string;
}

const EMPTY: Draft = {
  masterKey: '',
  label: '',
  resolution: 'FHD_1080P',
  durationSec: '',
  requiresAuth: false,
  status: 'DRAFT',
};

/**
 * Online playback sources for one episode.
 *
 * The field is a **storage key**, not a URL, and the form says so — that is the
 * single most important thing for whoever fills it in. A URL pasted here would
 * defeat the entire protection scheme, so the schema rejects anything that is
 * not a relative `.m3u8` path and the hint explains what to type instead.
 *
 * Packaging is out of scope: the team produces an HLS package with whatever
 * tool they already use (ffmpeg, Shaka Packager) and uploads it to the same
 * storage the rest of the media lives in. This screen only points at it.
 */
export function VideoManager({
  episodeId,
  episodeLabel,
  canDelete,
}: {
  episodeId: string;
  episodeLabel: string;
  canDelete: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [videos, setVideos] = useState<VideoRow[] | null>(null);
  const [editing, setEditing] = useState<VideoRow | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<VideoRow | null>(null);

  const load = async () => {
    try {
      setVideos(await apiFetch<VideoRow[]>(`/api/v1/admin/videos?episodeId=${episodeId}`));
    } catch {
      setVideos([]);
    }
  };

  useEffect(() => {
    void load();
    // `episodeId` is the only input; re-fetching on every render would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodeId]);

  const openNew = () => {
    setDraft(EMPTY);
    setEditing('new');
    setFieldErrors({});
    setFormError(null);
  };

  const openEdit = (video: VideoRow) => {
    setDraft({
      masterKey: video.masterKey,
      label: video.label ?? '',
      resolution: video.resolution,
      durationSec: video.durationSec ? String(video.durationSec) : '',
      requiresAuth: video.requiresAuth,
      status: video.status,
    });
    setEditing(video);
    setFieldErrors({});
    setFormError(null);
  };

  const submit = async () => {
    setPending(true);
    setFieldErrors({});
    setFormError(null);

    const body = {
      episodeId,
      masterKey: draft.masterKey.trim(),
      label: draft.label.trim() || null,
      resolution: draft.resolution,
      durationSec: draft.durationSec ? Number(draft.durationSec) : null,
      requiresAuth: draft.requiresAuth,
      status: draft.status,
    };

    try {
      if (editing && editing !== 'new') {
        await apiFetch(`/api/v1/admin/videos/${editing.id}`, { method: 'PUT', body });
        toast.success('Videóforrás mentve');
      } else {
        await apiFetch('/api/v1/admin/videos', { method: 'POST', body });
        toast.success('Videóforrás hozzáadva');
      }
      setEditing(null);
      await load();
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fields);
        setFormError(Object.keys(error.fields).length === 0 ? error.message : null);
      } else {
        setFormError('Váratlan hiba történt.');
      }
    } finally {
      setPending(false);
    }
  };

  const remove = async (video: VideoRow) => {
    try {
      await apiFetch(`/api/v1/admin/videos/${video.id}`, { method: 'DELETE' });
      toast.success('Videóforrás eltávolítva');
      await load();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'A törlés nem sikerült.');
    }
  };

  return (
    <div className="rounded-lg border border-ink-800 bg-ink-900/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-mist-100">
            <Film className="size-4 text-bloom-400" aria-hidden />
            Online lejátszás — {episodeLabel}
          </p>
          <p className="mt-1 text-2xs text-mist-500">
            Aláírt, lejáró szegmensekkel szolgáljuk ki. A tárolási kulcs sosem jut el a
            böngészőig.
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={openNew}
          leadingIcon={<Plus className="size-3.5" aria-hidden />}
        >
          Forrás hozzáadása
        </Button>
      </div>

      {videos === null ? (
        <p className="mt-3 text-2xs text-mist-600">Betöltés…</p>
      ) : videos.length === 0 ? (
        <p className="mt-3 text-2xs text-mist-600">
          Nincs online forrás. Az epizód oldalán a borítókép jelenik meg helyette.
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {videos.map((video) => (
            <li
              key={video.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-800 bg-ink-900/60 px-3 py-2"
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm text-mist-100">
                    {video.label ?? RESOLUTIONS.find((r) => r.value === video.resolution)?.label}
                  </span>
                  <Badge tone={video.status === 'PUBLISHED' ? 'success' : 'neutral'} size="sm">
                    {STATUSES.find((s) => s.value === video.status)?.label ?? video.status}
                  </Badge>
                  {video.requiresAuth && (
                    <span title="Bejelentkezés szükséges">
                      <Lock className="size-3 text-ember-400" aria-label="Bejelentkezés szükséges" />
                    </span>
                  )}
                </span>
                <span className="nums mt-0.5 block truncate font-mono text-2xs text-mist-600">
                  {video.masterKey}
                </span>
              </span>

              <span className="nums flex shrink-0 items-center gap-1 text-2xs text-mist-500">
                <Eye className="size-3" aria-hidden />
                {video.viewCount}
                {video.durationSec ? ` · ${formatDuration(video.durationSec)}` : ''}
              </span>

              <Button variant="ghost" size="sm" onClick={() => openEdit(video)}>
                Szerkesztés
              </Button>

              {canDelete && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setDeleting(video)}
                  aria-label="Videóforrás eltávolítása"
                >
                  <Trash2 className="size-3.5 text-danger-400" aria-hidden />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <Modal
          open
          onClose={() => setEditing(null)}
          title={editing === 'new' ? 'Új videóforrás' : 'Videóforrás szerkesztése'}
          size="md"
          dismissible={!pending}
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={() => setEditing(null)} disabled={pending}>
                Mégse
              </Button>
              <Button variant="primary" size="sm" onClick={submit} loading={pending}>
                Mentés
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            {formError && <InlineError message={formError} />}

            <Field
              label="Tárolási kulcs"
              required
              hint="A master.m3u8 útvonala a médiatárolóban — nem URL. Pl. video/yoru-01/master.m3u8"
              error={fieldErrors.masterKey}
            >
              {({ id, invalid, describedBy }) => (
                <Input
                  id={id}
                  value={draft.masterKey}
                  invalid={invalid}
                  aria-describedby={describedBy}
                  placeholder="video/yoru-01/master.m3u8"
                  className="font-mono"
                  onChange={(event) => setDraft({ ...draft, masterKey: event.target.value })}
                />
              )}
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Felirat" hint="Pl. „1080p BD”." error={fieldErrors.label}>
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    value={draft.label}
                    aria-describedby={describedBy}
                    onChange={(event) => setDraft({ ...draft, label: event.target.value })}
                  />
                )}
              </Field>

              <Field label="Felbontás" required error={fieldErrors.resolution}>
                {({ id }) => (
                  <Select
                    id={id}
                    value={draft.resolution}
                    onChange={(event) => setDraft({ ...draft, resolution: event.target.value })}
                  >
                    {RESOLUTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label="Hossz (mp)" error={fieldErrors.durationSec}>
                {({ id }) => (
                  <Input
                    id={id}
                    type="number"
                    min={0}
                    value={draft.durationSec}
                    onChange={(event) => setDraft({ ...draft, durationSec: event.target.value })}
                  />
                )}
              </Field>

              <Field label="Állapot" required error={fieldErrors.status}>
                {({ id }) => (
                  <Select
                    id={id}
                    value={draft.status}
                    onChange={(event) => setDraft({ ...draft, status: event.target.value })}
                  >
                    {STATUSES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>

            <Switch
              checked={draft.requiresAuth}
              onChange={(requiresAuth) => setDraft({ ...draft, requiresAuth })}
              label="Bejelentkezés szükséges"
              description="Csak belépett felhasználók indíthatják el a lejátszást."
            />
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) await remove(deleting);
          setDeleting(null);
        }}
        title="Videóforrás eltávolítása"
        description="A lejátszás azonnal leáll. A tárolóban lévő fájlokat nem törli — azokat külön kell kezelned."
        confirmLabel="Eltávolítás"
      />
    </div>
  );
}
