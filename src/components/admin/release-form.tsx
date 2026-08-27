'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type {
  LinkAvailability,
  LinkKind,
  PublishStatus,
  ReleaseKind,
  Resolution,
} from '@prisma/client';
import { GripVertical, Plus, Save, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { ConfirmDialog } from '@/components/ui/modal';
import { InlineError } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';
import {
  LINK_KIND_LABEL,
  PUBLISH_STATUS,
  RELEASE_KIND_LABEL,
  RESOLUTION_LABEL,
} from '@/components/ui/badge';
import { ApiError, apiFetch, type FieldErrors } from '@/lib/client/api';
import type { LinkFormValue, ReleaseFormValues } from '@/lib/forms/defaults';

/**
 * Release editor.
 *
 * The interesting part is link management. Links are edited as a set, with
 * existing rows carrying their database id so the server can reconcile rather
 * than delete-and-recreate — recreating would reset each link's download
 * counter and destroy the statistics.
 *
 * Ordering is explicit (`priority`) rather than implicit, because the first link
 * is the one most people will click and the team needs to control which mirror
 * that is.
 */
export function ReleaseForm({
  releaseId,
  initial,
  projects,
  episodes,
  formats,
  hosts,
  canDelete,
  onProjectChange,
}: {
  releaseId?: string;
  initial: ReleaseFormValues;
  projects: Array<{ id: string; title: string }>;
  episodes: Array<{ id: string; number: number; title: string | null }>;
  formats: Array<{ id: string; label: string; container: string }>;
  hosts: Array<{ id: string; name: string }>;
  canDelete: boolean;
  onProjectChange?: (projectId: string) => void;
}) {
  const router = useRouter();
  const toast = useToast();

  const [values, setValues] = useState(initial);
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = <K extends keyof ReleaseFormValues>(key: K, value: ReleaseFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (values.projectId) onProjectChange?.(values.projectId);
  }, [values.projectId, onProjectChange]);

  const sortedLinks = useMemo(
    () => [...values.links].sort((a, b) => a.priority - b.priority),
    [values.links],
  );

  const addLink = () =>
    set('links', [
      ...values.links,
      {
        localKey: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        hostId: '',
        kind: 'DIRECT',
        label: '',
        url: '',
        isMirror: values.links.length > 0,
        priority: values.links.length,
        availability: 'UNCHECKED',
      },
    ]);

  const updateLink = (localKey: string, patch: Partial<LinkFormValue>) =>
    set(
      'links',
      values.links.map((link) => (link.localKey === localKey ? { ...link, ...patch } : link)),
    );

  const removeLink = (localKey: string) =>
    set(
      'links',
      values.links
        .filter((link) => link.localKey !== localKey)
        .map((link, index) => ({ ...link, priority: index })),
    );

  const moveLink = (localKey: string, direction: -1 | 1) => {
    const ordered = [...sortedLinks];
    const index = ordered.findIndex((link) => link.localKey === localKey);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= ordered.length) return;

    [ordered[index], ordered[target]] = [ordered[target]!, ordered[index]!];
    set(
      'links',
      ordered.map((link, position) => ({ ...link, priority: position })),
    );
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setFieldErrors({});
    setFormError(null);

    const payload = {
      projectId: values.projectId,
      episodeId: values.episodeId || null,
      kind: values.kind,
      version: Number(values.version) || 1,
      formatId: values.formatId || null,
      resolution: values.resolution,
      videoCodec: values.videoCodec,
      audioCodec: values.audioCodec,
      subtitleFormat: values.subtitleFormat,
      fileSizeBytes: values.fileSizeBytes ? Number(values.fileSizeBytes) : '',
      durationSec: values.durationSec ? Number(values.durationSec) : null,
      crc32: values.crc32 || '',
      changelog: values.changelog,
      notes: values.notes,
      status: values.status,
      releasedAt: values.releasedAt || '',
      links: sortedLinks.map((link) => ({
        ...(link.id ? { id: link.id } : {}),
        hostId: link.hostId || null,
        kind: link.kind,
        label: link.label,
        url: link.url,
        isMirror: link.isMirror,
        priority: link.priority,
        availability: link.availability,
      })),
    };

    try {
      const result = await apiFetch<{ id: string }>(
        releaseId ? `/api/v1/admin/releases/${releaseId}` : '/api/v1/admin/releases',
        { method: releaseId ? 'PUT' : 'POST', body: payload },
      );

      toast.success(
        releaseId ? 'Kiadás mentve' : 'Kiadás létrehozva',
        values.status === 'PUBLISHED' ? 'A követők értesítést kapnak.' : undefined,
      );

      if (releaseId) router.refresh();
      else router.push(`/admin/kiadasok/${result.id}`);
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

  const handleDelete = async () => {
    if (!releaseId) return;
    await apiFetch(`/api/v1/admin/releases/${releaseId}`, { method: 'DELETE' });
    toast.success('Kiadás törölve');
    router.push('/admin/kiadasok');
  };

  return (
    <>
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {formError && <InlineError message={formError} />}

        <Card>
          <CardHeader title="Mihez tartozik" />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Projekt" required error={fieldErrors.projectId}>
                {({ id, invalid }) => (
                  <Select
                    id={id}
                    value={values.projectId}
                    onChange={(event) => {
                      set('projectId', event.target.value);
                      set('episodeId', '');
                    }}
                    required
                    invalid={invalid}
                  >
                    <option value="">Válassz projektet…</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.title}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field
                label="Epizód"
                optionalLabel
                hint="Batch és film kiadásnál hagyd üresen."
                error={fieldErrors.episodeId}
              >
                {({ id, describedBy }) => (
                  <Select
                    id={id}
                    value={values.episodeId}
                    onChange={(event) => set('episodeId', event.target.value)}
                    disabled={!values.projectId}
                    aria-describedby={describedBy}
                  >
                    <option value="">Nincs (batch / film)</option>
                    {episodes.map((episode) => (
                      <option key={episode.id} value={episode.id}>
                        {episode.number}. rész{episode.title ? ` – ${episode.title}` : ''}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Kiadás típusa" required>
                {({ id }) => (
                  <Select
                    id={id}
                    value={values.kind}
                    onChange={(event) => set('kind', event.target.value as ReleaseKind)}
                  >
                    {Object.entries(RELEASE_KIND_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field
                label="Verzió"
                required
                hint="Javított kiadásnál emeld (v2, v3…)."
                error={fieldErrors.version}
              >
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    type="number"
                    min={1}
                    max={99}
                    value={values.version}
                    onChange={(event) => set('version', event.target.value)}
                    invalid={invalid}
                    aria-describedby={describedBy}
                  />
                )}
              </Field>

              <Field label="Formátum" optionalLabel>
                {({ id }) => (
                  <Select
                    id={id}
                    value={values.formatId}
                    onChange={(event) => set('formatId', event.target.value)}
                  >
                    <option value="">—</option>
                    {formats.map((format) => (
                      <option key={format.id} value={format.id}>
                        {format.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Technikai adatok" description="Ez jelenik meg a letöltési panelen." />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-4">
              <Field label="Felbontás" required>
                {({ id }) => (
                  <Select
                    id={id}
                    value={values.resolution}
                    onChange={(event) => set('resolution', event.target.value as Resolution)}
                  >
                    {Object.entries(RESOLUTION_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label="Videó kodek" optionalLabel>
                {({ id }) => (
                  <Input
                    id={id}
                    value={values.videoCodec}
                    onChange={(event) => set('videoCodec', event.target.value)}
                    placeholder="H.264"
                  />
                )}
              </Field>

              <Field label="Hang" optionalLabel>
                {({ id }) => (
                  <Input
                    id={id}
                    value={values.audioCodec}
                    onChange={(event) => set('audioCodec', event.target.value)}
                    placeholder="AAC 2.0"
                  />
                )}
              </Field>

              <Field label="Felirat" optionalLabel>
                {({ id }) => (
                  <Input
                    id={id}
                    value={values.subtitleFormat}
                    onChange={(event) => set('subtitleFormat', event.target.value)}
                    placeholder="ASS"
                  />
                )}
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label="Fájlméret (bájt)"
                optionalLabel
                hint="Pontos bájtérték; az oldal olvashatóan jeleníti meg."
                error={fieldErrors.fileSizeBytes}
              >
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    type="number"
                    min={0}
                    value={values.fileSizeBytes}
                    onChange={(event) => set('fileSizeBytes', event.target.value)}
                    invalid={invalid}
                    aria-describedby={describedBy}
                  />
                )}
              </Field>

              <Field label="Hossz (mp)" optionalLabel error={fieldErrors.durationSec}>
                {({ id, invalid }) => (
                  <Input
                    id={id}
                    type="number"
                    min={0}
                    value={values.durationSec}
                    onChange={(event) => set('durationSec', event.target.value)}
                    invalid={invalid}
                  />
                )}
              </Field>

              <Field label="CRC32" optionalLabel hint="8 hexa karakter." error={fieldErrors.crc32}>
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    value={values.crc32}
                    onChange={(event) => set('crc32', event.target.value.toUpperCase())}
                    maxLength={8}
                    className="font-mono uppercase"
                    invalid={invalid}
                    aria-describedby={describedBy}
                    placeholder="A1B2C3D4"
                  />
                )}
              </Field>
            </div>

            {Number(values.version) > 1 && (
              <Field
                label="Változások a v"
                hint="Mit javítottatok az előző verzióhoz képest? Ez a szöveg kiemelve jelenik meg."
                error={fieldErrors.changelog}
              >
                {({ id, describedBy, invalid }) => (
                  <Textarea
                    id={id}
                    rows={3}
                    maxLength={2000}
                    value={values.changelog}
                    onChange={(event) => set('changelog', event.target.value)}
                    invalid={invalid}
                    aria-describedby={describedBy}
                    placeholder="Javított időzítés, új karaoke, elgépelések javítva…"
                  />
                )}
              </Field>
            )}

            <Field label="Megjegyzés" optionalLabel error={fieldErrors.notes}>
              {({ id, invalid }) => (
                <Textarea
                  id={id}
                  rows={2}
                  maxLength={2000}
                  value={values.notes}
                  onChange={(event) => set('notes', event.target.value)}
                  invalid={invalid}
                />
              )}
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Letöltési linkek"
            description="Az első link a javasolt forrás. A többi tükörként jelenik meg."
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={addLink}
                leadingIcon={<Plus className="size-4" aria-hidden />}
              >
                Link hozzáadása
              </Button>
            }
          />

          <CardBody>
            {sortedLinks.length === 0 ? (
              <p className="rounded-lg border border-dashed border-ink-700 px-4 py-8 text-center text-sm text-mist-500">
                Még nincs link. Publikált kiadás link nélkül nem tölthető le.
              </p>
            ) : (
              <ul className="space-y-3">
                {sortedLinks.map((link, index) => (
                  <li
                    key={link.localKey}
                    className="rounded-xl border border-ink-800 bg-ink-950/40 p-3.5"
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <span
                        aria-hidden
                        className="nums grid size-6 shrink-0 place-items-center rounded-md bg-ink-800 text-2xs font-bold text-mist-400"
                      >
                        {index + 1}
                      </span>

                      <div className="flex gap-0.5">
                        <button
                          type="button"
                          onClick={() => moveLink(link.localKey, -1)}
                          disabled={index === 0}
                          aria-label="Feljebb"
                          className="rounded p-1 text-mist-500 hover:bg-ink-800 hover:text-mist-200 disabled:opacity-30"
                        >
                          <GripVertical className="size-3.5 rotate-90" aria-hidden />
                        </button>
                      </div>

                      {link.isMirror && (
                        <span className="rounded-full bg-ink-800 px-2 py-0.5 text-2xs text-mist-400">
                          Tükör
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => removeLink(link.localKey)}
                        aria-label="Link eltávolítása"
                        className="ml-auto rounded p-1.5 text-danger-400 hover:bg-danger-500/10"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-[8rem_10rem_1fr]">
                      <Field label="Típus">
                        {({ id }) => (
                          <Select
                            id={id}
                            selectSize="sm"
                            value={link.kind}
                            onChange={(event) =>
                              updateLink(link.localKey, { kind: event.target.value as LinkKind })
                            }
                          >
                            {Object.entries(LINK_KIND_LABEL).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </Select>
                        )}
                      </Field>

                      <Field label="Tárhely">
                        {({ id }) => (
                          <Select
                            id={id}
                            selectSize="sm"
                            value={link.hostId}
                            onChange={(event) =>
                              updateLink(link.localKey, { hostId: event.target.value })
                            }
                          >
                            <option value="">—</option>
                            {hosts.map((host) => (
                              <option key={host.id} value={host.id}>
                                {host.name}
                              </option>
                            ))}
                          </Select>
                        )}
                      </Field>

                      <Field label="URL" required>
                        {({ id }) => (
                          <Input
                            id={id}
                            inputSize="sm"
                            value={link.url}
                            onChange={(event) =>
                              updateLink(link.localKey, { url: event.target.value })
                            }
                            className="font-mono text-xs"
                            placeholder="https://… vagy magnet:?…"
                            required
                          />
                        )}
                      </Field>
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_10rem]">
                      <Field label="Címke" optionalLabel>
                        {({ id }) => (
                          <Input
                            id={id}
                            inputSize="sm"
                            value={link.label}
                            onChange={(event) =>
                              updateLink(link.localKey, { label: event.target.value })
                            }
                            placeholder="pl. Fő szerver"
                          />
                        )}
                      </Field>

                      <Field label="Elérhetőség">
                        {({ id }) => (
                          <Select
                            id={id}
                            selectSize="sm"
                            value={link.availability}
                            onChange={(event) =>
                              updateLink(link.localKey, {
                                availability: event.target.value as LinkAvailability,
                              })
                            }
                          >
                            <option value="UNCHECKED">Nem ellenőrzött</option>
                            <option value="ONLINE">Elérhető</option>
                            <option value="DEGRADED">Lassú</option>
                            <option value="OFFLINE">Nem elérhető</option>
                          </Select>
                        )}
                      </Field>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Publikálás" />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Állapot" required>
                {({ id }) => (
                  <Select
                    id={id}
                    value={values.status}
                    onChange={(event) => set('status', event.target.value as PublishStatus)}
                  >
                    {Object.entries(PUBLISH_STATUS).map(([value, config]) => (
                      <option key={value} value={value}>
                        {config.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field
                label="Megjelenés időpontja"
                optionalLabel
                hint="Ütemezett állapotnál ekkor válik automatikusan láthatóvá."
                error={fieldErrors.releasedAt}
              >
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    type="datetime-local"
                    value={values.releasedAt}
                    onChange={(event) => set('releasedAt', event.target.value)}
                    invalid={invalid}
                    aria-describedby={describedBy}
                  />
                )}
              </Field>
            </div>

            {values.status === 'PUBLISHED' && sortedLinks.length === 0 && (
              <InlineError message="Publikált kiadás letöltési link nélkül: a látogatók nem tudnak mit kezdeni vele." />
            )}
          </CardBody>
        </Card>

        <div className="flex flex-wrap items-center gap-3 border-t border-ink-800 pt-5">
          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={pending}
            leadingIcon={<Save className="size-4" aria-hidden />}
          >
            {releaseId ? 'Mentés' : 'Létrehozás'}
          </Button>

          <Button variant="ghost" size="md" onClick={() => router.push('/admin/kiadasok')}>
            Mégse
          </Button>

          {canDelete && releaseId && (
            <Button
              variant="danger"
              size="md"
              className={cn('ml-auto')}
              onClick={() => setConfirmDelete(true)}
              leadingIcon={<Trash2 className="size-4" aria-hidden />}
            >
              Törlés
            </Button>
          )}
        </div>
      </form>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Kiadás törlése"
        description="A kiadás és a hozzá tartozó linkek eltűnnek a nyilvános oldalról. A letöltési statisztika megmarad."
        confirmLabel="Törlés"
      />
    </>
  );
}
