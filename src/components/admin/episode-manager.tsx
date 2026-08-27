'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { EpisodeStatus } from '@prisma/client';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { formatDate, formatEpisodeNumber } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { ConfirmDialog, Modal } from '@/components/ui/modal';
import { EPISODE_STATUS, EpisodeStatusBadge } from '@/components/ui/badge';
import { EmptyState, InlineError } from '@/components/ui/feedback';
import { WorkflowProgress, buildWorkflowStages, overallProgress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/toast';
import { ApiError, apiFetch, type FieldErrors } from '@/lib/client/api';

export interface EpisodeRow {
  id: string;
  number: number;
  title: string | null;
  status: EpisodeStatus;
  airedAt: string | null;
  releaseCount: number;
  progressTranslation: number;
  progressTiming: number;
  progressTypesetting: number;
  progressEditing: number;
  progressEncoding: number;
  progressQc: number;
}

const STAGES = [
  { key: 'progressTranslation', label: 'Fordítás' },
  { key: 'progressTiming', label: 'Időzítés' },
  { key: 'progressTypesetting', label: 'Formázás' },
  { key: 'progressEditing', label: 'Lektorálás' },
  { key: 'progressEncoding', label: 'Enkódolás' },
  { key: 'progressQc', label: 'Ellenőrzés' },
] as const;

type StageKey = (typeof STAGES)[number]['key'];

/**
 * Episode manager.
 *
 * Lives inside the project editor rather than on its own screen, because
 * episodes are never edited in isolation — you open a project to update where
 * its episodes stand. The progress sliders are the most-used control in the
 * whole admin panel, so they get numeric inputs *and* range sliders: the slider
 * for a quick nudge, the number for "it's exactly 80".
 */
export function EpisodeManager({
  projectId,
  episodes,
  canDelete,
}: {
  projectId: string;
  episodes: EpisodeRow[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<EpisodeRow | 'new' | null>(null);
  const [deleting, setDeleting] = useState<EpisodeRow | null>(null);

  const nextNumber =
    episodes.length > 0 ? Math.floor(Math.max(...episodes.map((e) => e.number))) + 1 : 1;

  const handleDelete = async () => {
    if (!deleting) return;
    await apiFetch(`/api/v1/admin/episodes/${deleting.id}`, { method: 'DELETE' });
    toast.success('Epizód törölve');
    router.refresh();
  };

  return (
    <>
      <Card>
        <CardHeader
          title="Epizódok"
          description="A munkafolyamat állapota valós időben látszik a nyilvános oldalon."
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditing('new')}
              leadingIcon={<Plus className="size-4" aria-hidden />}
            >
              Új epizód
            </Button>
          }
        />

        <CardBody>
          {episodes.length === 0 ? (
            <EmptyState
              title="Még nincs epizód"
              description="Vedd fel az első epizódot, hogy a látogatók lássák, hol tart a munka."
              action={{ label: 'Epizód hozzáadása', onClick: () => setEditing('new') }}
              compact
            />
          ) : (
            <ul className="space-y-2">
              {episodes.map((episode) => {
                const stages = buildWorkflowStages(episode);

                return (
                  <li
                    key={episode.id}
                    className="rounded-xl border border-ink-800 bg-ink-900/40 p-3.5"
                  >
                    <div className="flex flex-wrap items-start gap-3">
                      <span
                        aria-hidden
                        className="nums grid size-9 shrink-0 place-items-center rounded-lg bg-ink-850 font-display text-xs font-bold text-mist-300"
                      >
                        {formatEpisodeNumber(episode.number)}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-mist-100">
                            {episode.title ?? `${formatEpisodeNumber(episode.number)}. rész`}
                          </span>
                          <EpisodeStatusBadge status={episode.status} />
                          {episode.releaseCount > 0 && (
                            <span className="nums text-2xs text-mist-500">
                              {episode.releaseCount} kiadás
                            </span>
                          )}
                        </div>

                        <div className="mt-2 max-w-md">
                          <WorkflowProgress stages={stages} compact />
                        </div>

                        {episode.airedAt && (
                          <p className="mt-1.5 text-2xs text-mist-600">
                            Sugárzás: {formatDate(episode.airedAt)}
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setEditing(episode)}
                          aria-label={`${formatEpisodeNumber(episode.number)}. rész szerkesztése`}
                        >
                          <Pencil className="size-4" aria-hidden />
                        </Button>

                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setDeleting(episode)}
                            aria-label={`${formatEpisodeNumber(episode.number)}. rész törlése`}
                            className="text-danger-400 hover:bg-danger-500/10"
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      {editing && (
        <EpisodeDialog
          projectId={projectId}
          episode={editing === 'new' ? null : editing}
          defaultNumber={nextNumber}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        title="Epizód törlése"
        description={
          deleting?.releaseCount
            ? `Ehhez az epizódhoz ${deleting.releaseCount} kiadás tartozik. A törlés után azok is elérhetetlenné válnak.`
            : 'Az epizód eltűnik a nyilvános oldalról.'
        }
        confirmLabel="Törlés"
      />
    </>
  );
}

function EpisodeDialog({
  projectId,
  episode,
  defaultNumber,
  onClose,
  onSaved,
}: {
  projectId: string;
  episode: EpisodeRow | null;
  defaultNumber: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const [values, setValues] = useState({
    number: episode ? String(episode.number) : String(defaultNumber),
    title: episode?.title ?? '',
    status: episode?.status ?? ('PLANNED' as EpisodeStatus),
    airedAt: episode?.airedAt ? episode.airedAt.slice(0, 10) : '',
    progressTranslation: episode?.progressTranslation ?? 0,
    progressTiming: episode?.progressTiming ?? 0,
    progressTypesetting: episode?.progressTypesetting ?? 0,
    progressEditing: episode?.progressEditing ?? 0,
    progressEncoding: episode?.progressEncoding ?? 0,
    progressQc: episode?.progressQc ?? 0,
  });

  const overall = overallProgress(
    STAGES.map((stage) => ({
      key: stage.key,
      label: stage.label,
      short: stage.label,
      value: values[stage.key],
    })),
  );

  const submit = async () => {
    setPending(true);
    setFieldErrors({});
    setFormError(null);

    try {
      await apiFetch(
        episode ? `/api/v1/admin/episodes/${episode.id}` : '/api/v1/admin/episodes',
        {
          method: episode ? 'PUT' : 'POST',
          body: {
            projectId,
            number: Number(values.number),
            title: values.title,
            status: values.status,
            airedAt: values.airedAt || '',
            progressTranslation: values.progressTranslation,
            progressTiming: values.progressTiming,
            progressTypesetting: values.progressTypesetting,
            progressEditing: values.progressEditing,
            progressEncoding: values.progressEncoding,
            progressQc: values.progressQc,
          },
        },
      );

      toast.success(episode ? 'Epizód mentve' : 'Epizód létrehozva');
      onSaved();
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

  return (
    <Modal
      open
      onClose={onClose}
      title={episode ? `${formatEpisodeNumber(episode.number)}. rész szerkesztése` : 'Új epizód'}
      description={`A munkafolyamat jelenleg ${overall}%-on áll.`}
      size="lg"
      dismissible={!pending}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
            Mégse
          </Button>
          <Button variant="primary" size="sm" onClick={submit} loading={pending}>
            {episode ? 'Mentés' : 'Létrehozás'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {formError && <InlineError message={formError} />}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Sorszám"
            required
            hint="Törtszám is lehet (12.5)."
            error={fieldErrors.number}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                type="number"
                step="0.5"
                min={0}
                value={values.number}
                onChange={(event) => setValues({ ...values, number: event.target.value })}
                invalid={invalid}
                aria-describedby={describedBy}
              />
            )}
          </Field>

          <Field label="Állapot" required>
            {({ id }) => (
              <Select
                id={id}
                value={values.status}
                onChange={(event) =>
                  setValues({ ...values, status: event.target.value as EpisodeStatus })
                }
              >
                {Object.entries(EPISODE_STATUS).map(([value, config]) => (
                  <option key={value} value={value}>
                    {config.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Sugárzás" optionalLabel error={fieldErrors.airedAt}>
            {({ id, invalid }) => (
              <Input
                id={id}
                type="date"
                value={values.airedAt}
                onChange={(event) => setValues({ ...values, airedAt: event.target.value })}
                invalid={invalid}
              />
            )}
          </Field>
        </div>

        <Field label="Epizód címe" optionalLabel error={fieldErrors.title}>
          {({ id, invalid }) => (
            <Input
              id={id}
              value={values.title}
              onChange={(event) => setValues({ ...values, title: event.target.value })}
              maxLength={200}
              invalid={invalid}
            />
          )}
        </Field>

        <fieldset className="rounded-xl border border-ink-800 bg-ink-950/40 p-4">
          <legend className="px-1.5 text-sm font-medium text-mist-200">Munkafolyamat</legend>

          <div className="mt-2 space-y-3.5">
            {STAGES.map((stage) => (
              <StageSlider
                key={stage.key}
                label={stage.label}
                value={values[stage.key]}
                onChange={(value) => setValues({ ...values, [stage.key]: value })}
              />
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-ink-800 pt-4">
            <Button
              variant="subtle"
              size="xs"
              onClick={() =>
                setValues({
                  ...values,
                  ...Object.fromEntries(STAGES.map((stage) => [stage.key, 100])),
                } as typeof values)
              }
            >
              Mind 100%
            </Button>
            <Button
              variant="subtle"
              size="xs"
              onClick={() =>
                setValues({
                  ...values,
                  ...Object.fromEntries(STAGES.map((stage) => [stage.key, 0])),
                } as typeof values)
              }
            >
              Mind nullázása
            </Button>
          </div>
        </fieldset>
      </div>
    </Modal>
  );
}

function StageSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const id = `stage-${label}`;

  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className="w-24 shrink-0 text-xs text-mist-300">
        {label}
      </label>

      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-ink-750 accent-tide-400"
      />

      <input
        type="number"
        min={0}
        max={100}
        value={value}
        onChange={(event) =>
          onChange(Math.max(0, Math.min(100, Number(event.target.value) || 0)))
        }
        aria-label={`${label} százalék`}
        className="nums h-8 w-14 shrink-0 rounded-md border border-ink-700 bg-ink-900 px-2 text-right text-xs text-mist-200"
      />
    </div>
  );
}

export type { StageKey };
