'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Check, RotateCcw, Save, Trash2 } from 'lucide-react';
import type {
  AgeRating,
  AnimeSeason,
  ProjectStatus,
  ProjectType,
  PublishStatus,
} from '@prisma/client';
import { cn, formatRelative, slugify } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field';
import { ConfirmDialog } from '@/components/ui/modal';
import { InlineError } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';
import { ImageField } from '@/components/admin/image-field';
import {
  AGE_RATING_LABEL,
  PROJECT_STATUS,
  PROJECT_TYPE_LABEL,
  PUBLISH_STATUS,
  SEASON_LABEL,
} from '@/components/ui/badge';
import { ApiError, apiFetch, type FieldErrors } from '@/lib/client/api';
import { useFormDraft } from '@/lib/client/use-form-draft';
import type { ProjectFormValues } from '@/lib/forms/defaults';

/**
 * Project editor.
 *
 * Grouped into four cards rather than one long column: identity, classification,
 * media, and publication. A 25-field form presented as an undifferentiated list
 * is where data-entry mistakes come from.
 *
 * The slug follows the title until the user edits it by hand, at which point it
 * stops — auto-generation is a convenience for new records, not a rule that
 * silently rewrites a published URL.
 */
export function ProjectForm({
  projectId,
  initial,
  genres,
  canDelete,
  canPublish,
}: {
  projectId?: string;
  initial: ProjectFormValues;
  genres: Array<{ id: string; name: string }>;
  canDelete: boolean;
  /**
   * False for a role that may write but not publish. The API enforces this on
   * every write; hiding the option here keeps the form from offering a choice
   * that would come back as a 403 after the editor filled in twenty fields.
   */
  canPublish: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [values, setValues] = useState(initial);
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(Boolean(initial.slug));
  const [confirmDelete, setConfirmDelete] = useState(false);

  const draft = useFormDraft<ProjectFormValues>(`project:${projectId ?? 'new'}`);

  const set = <K extends keyof ProjectFormValues>(key: K, value: ProjectFormValues[K]) => {
    setValues((current) => {
      const next = { ...current, [key]: value };
      if (key === 'title' && !slugTouched) next.slug = slugify(String(value));
      draft.save(next);
      return next;
    });
  };

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    const dirty = JSON.stringify(values) !== JSON.stringify(initial);
    if (!dirty) return;

    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [values, initial]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setFieldErrors({});
    setFormError(null);

    const payload = {
      slug: values.slug,
      title: values.title,
      titleRomaji: values.titleRomaji,
      titleNative: values.titleNative,
      titleEnglish: values.titleEnglish,
      synonyms: values.synonyms
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      synopsis: values.synopsis,
      type: values.type,
      status: values.status,
      publishStatus: values.publishStatus,
      season: values.season || null,
      seasonYear: values.seasonYear ? Number(values.seasonYear) : null,
      totalEpisodes: values.totalEpisodes ? Number(values.totalEpisodes) : null,
      ageRating: values.ageRating || null,
      studio: values.studio,
      source: values.source,
      durationMin: values.durationMin ? Number(values.durationMin) : null,
      coverImageUrl: values.coverImageUrl,
      bannerImageUrl: values.bannerImageUrl,
      trailerUrl: values.trailerUrl,
      accentColor: values.accentColor || null,
      malId: values.malId ? Number(values.malId) : null,
      anilistId: values.anilistId ? Number(values.anilistId) : null,
      isFeatured: values.isFeatured,
      genreIds: values.genreIds,
    };

    try {
      const result = await apiFetch<{ id: string }>(
        projectId ? `/api/v1/admin/projects/${projectId}` : '/api/v1/admin/projects',
        { method: projectId ? 'PUT' : 'POST', body: payload },
      );

      draft.clear();
      toast.success(projectId ? 'Projekt mentve' : 'Projekt létrehozva');

      if (projectId) router.refresh();
      else router.push(`/admin/projektek/${result.id}`);
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
    if (!projectId) return;
    await apiFetch(`/api/v1/admin/projects/${projectId}`, { method: 'DELETE' });
    draft.clear();
    toast.success('Projekt törölve');
    router.push('/admin/projektek');
  };

  return (
    <>
      {draft.recovered && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-ember-400/30 bg-ember-400/8 px-4 py-3">
          <RotateCcw className="size-4 shrink-0 text-ember-400" aria-hidden />
          <p className="min-w-0 flex-1 text-sm text-ember-300">
            Mentetlen piszkozatot találtunk {formatRelative(draft.recovered.savedAt)}.
          </p>
          <Button
            variant="warm"
            size="xs"
            onClick={() => {
              if (draft.recovered) setValues(draft.recovered.values);
              draft.discard();
            }}
          >
            Visszaállítás
          </Button>
          <Button variant="ghost" size="xs" onClick={draft.discard}>
            Elvetés
          </Button>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {formError && <InlineError message={formError} />}

        <Card>
          <CardHeader title="Azonosítás" description="Címek és URL." />
          <CardBody className="space-y-4">
            <Field label="Cím" required error={fieldErrors.title}>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  value={values.title}
                  onChange={(event) => set('title', event.target.value)}
                  required
                  maxLength={160}
                  invalid={invalid}
                  aria-describedby={describedBy}
                />
              )}
            </Field>

            <Field
              label="Slug"
              required
              hint="Az oldal URL-je: /projektek/<slug>. Publikálás után lehetőleg ne változtasd."
              error={fieldErrors.slug}
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  value={values.slug}
                  onChange={(event) => {
                    setSlugTouched(true);
                    set('slug', event.target.value);
                  }}
                  required
                  className="font-mono"
                  invalid={invalid}
                  aria-describedby={describedBy}
                />
              )}
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Romaji cím" optionalLabel error={fieldErrors.titleRomaji}>
                {({ id, invalid }) => (
                  <Input
                    id={id}
                    value={values.titleRomaji}
                    onChange={(event) => set('titleRomaji', event.target.value)}
                    invalid={invalid}
                  />
                )}
              </Field>

              <Field label="Japán cím" optionalLabel error={fieldErrors.titleNative}>
                {({ id, invalid }) => (
                  <Input
                    id={id}
                    value={values.titleNative}
                    onChange={(event) => set('titleNative', event.target.value)}
                    className="font-jp"
                    invalid={invalid}
                  />
                )}
              </Field>

              <Field label="Angol cím" optionalLabel error={fieldErrors.titleEnglish}>
                {({ id, invalid }) => (
                  <Input
                    id={id}
                    value={values.titleEnglish}
                    onChange={(event) => set('titleEnglish', event.target.value)}
                    invalid={invalid}
                  />
                )}
              </Field>
            </div>

            <Field
              label="Alternatív címek"
              optionalLabel
              hint="Vesszővel elválasztva. A kereső ezekre is talál."
              error={fieldErrors.synonyms}
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  value={values.synonyms}
                  onChange={(event) => set('synonyms', event.target.value)}
                  invalid={invalid}
                  aria-describedby={describedBy}
                  placeholder="SnK, Shingeki no Kyojin"
                />
              )}
            </Field>

            <Field label="Leírás" optionalLabel error={fieldErrors.synopsis}>
              {({ id, invalid }) => (
                <Textarea
                  id={id}
                  rows={5}
                  maxLength={4000}
                  showCount
                  value={values.synopsis}
                  onChange={(event) => set('synopsis', event.target.value)}
                  invalid={invalid}
                />
              )}
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Besorolás" />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Típus" required>
                {({ id }) => (
                  <Select
                    id={id}
                    value={values.type}
                    onChange={(event) => set('type', event.target.value as ProjectType)}
                  >
                    {Object.entries(PROJECT_TYPE_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label="Állapot" required>
                {({ id }) => (
                  <Select
                    id={id}
                    value={values.status}
                    onChange={(event) => set('status', event.target.value as ProjectStatus)}
                  >
                    {Object.entries(PROJECT_STATUS).map(([value, config]) => (
                      <option key={value} value={value}>
                        {config.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label="Korhatár" optionalLabel>
                {({ id }) => (
                  <Select
                    id={id}
                    value={values.ageRating}
                    onChange={(event) => set('ageRating', event.target.value as AgeRating | '')}
                  >
                    <option value="">Nincs megadva</option>
                    {Object.entries(AGE_RATING_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-4">
              <Field label="Évszak" optionalLabel>
                {({ id }) => (
                  <Select
                    id={id}
                    value={values.season}
                    onChange={(event) => set('season', event.target.value as AnimeSeason | '')}
                  >
                    <option value="">—</option>
                    {Object.entries(SEASON_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label="Év" optionalLabel error={fieldErrors.seasonYear}>
                {({ id, invalid }) => (
                  <Input
                    id={id}
                    type="number"
                    min={1960}
                    max={2100}
                    value={values.seasonYear}
                    onChange={(event) => set('seasonYear', event.target.value)}
                    invalid={invalid}
                  />
                )}
              </Field>

              <Field label="Részek száma" optionalLabel error={fieldErrors.totalEpisodes}>
                {({ id, invalid }) => (
                  <Input
                    id={id}
                    type="number"
                    min={1}
                    value={values.totalEpisodes}
                    onChange={(event) => set('totalEpisodes', event.target.value)}
                    invalid={invalid}
                  />
                )}
              </Field>

              <Field label="Hossz (perc)" optionalLabel error={fieldErrors.durationMin}>
                {({ id, invalid }) => (
                  <Input
                    id={id}
                    type="number"
                    min={1}
                    value={values.durationMin}
                    onChange={(event) => set('durationMin', event.target.value)}
                    invalid={invalid}
                  />
                )}
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Stúdió" optionalLabel error={fieldErrors.studio}>
                {({ id, invalid }) => (
                  <Input
                    id={id}
                    value={values.studio}
                    onChange={(event) => set('studio', event.target.value)}
                    invalid={invalid}
                  />
                )}
              </Field>

              <Field label="Forrás" optionalLabel hint="Manga, light novel, eredeti…">
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    value={values.source}
                    onChange={(event) => set('source', event.target.value)}
                    aria-describedby={describedBy}
                  />
                )}
              </Field>
            </div>

            <fieldset>
              <legend className="mb-2.5 text-sm font-medium text-mist-200">Műfajok</legend>
              <div className="flex flex-wrap gap-2">
                {genres.map((genre) => {
                  const active = values.genreIds.includes(genre.id);
                  return (
                    <button
                      key={genre.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        set(
                          'genreIds',
                          active
                            ? values.genreIds.filter((id) => id !== genre.id)
                            : [...values.genreIds, genre.id],
                        )
                      }
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-2xs font-medium transition-colors duration-fast',
                        active
                          ? 'border-tide-400/40 bg-tide-400/12 text-tide-200'
                          : 'border-ink-700 bg-ink-900 text-mist-400 hover:border-ink-600 hover:text-mist-200',
                      )}
                    >
                      {genre.name}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Média" description="Képek és külső azonosítók." />
          <CardBody className="space-y-4">
            <ImageField
              label="Borítókép"
              hint="2:3 arány ajánlott."
              value={values.coverImageUrl}
              onChange={(value) => set('coverImageUrl', value)}
              error={fieldErrors.coverImageUrl}
              folder="projects"
              aspect="poster"
            />

            <ImageField
              label="Banner"
              hint="16:9 vagy szélesebb."
              value={values.bannerImageUrl}
              onChange={(value) => set('bannerImageUrl', value)}
              error={fieldErrors.bannerImageUrl}
              folder="projects"
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Előzetes URL" optionalLabel error={fieldErrors.trailerUrl}>
                {({ id, invalid }) => (
                  <Input
                    id={id}
                    type="url"
                    value={values.trailerUrl}
                    onChange={(event) => set('trailerUrl', event.target.value)}
                    invalid={invalid}
                  />
                )}
              </Field>

              <Field
                label="Kiemelő szín"
                optionalLabel
                hint="A projektoldal hangulatát adja."
                error={fieldErrors.accentColor}
              >
                {({ id, describedBy, invalid }) => (
                  <div className="flex gap-2">
                    <Input
                      id={id}
                      value={values.accentColor}
                      onChange={(event) => set('accentColor', event.target.value)}
                      placeholder="#4cd8ff"
                      className="font-mono"
                      invalid={invalid}
                      aria-describedby={describedBy}
                    />
                    <input
                      type="color"
                      aria-label="Szín választása"
                      value={values.accentColor || '#4cd8ff'}
                      onChange={(event) => set('accentColor', event.target.value)}
                      className="h-11 w-12 shrink-0 cursor-pointer rounded-lg border border-ink-700 bg-ink-900 p-1"
                    />
                  </div>
                )}
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="MyAnimeList ID" optionalLabel error={fieldErrors.malId}>
                {({ id, invalid }) => (
                  <Input
                    id={id}
                    type="number"
                    value={values.malId}
                    onChange={(event) => set('malId', event.target.value)}
                    invalid={invalid}
                  />
                )}
              </Field>

              <Field label="AniList ID" optionalLabel error={fieldErrors.anilistId}>
                {({ id, invalid }) => (
                  <Input
                    id={id}
                    type="number"
                    value={values.anilistId}
                    onChange={(event) => set('anilistId', event.target.value)}
                    invalid={invalid}
                  />
                )}
              </Field>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Publikálás" />
          <CardBody className="space-y-4">
            <Field
              label="Publikálási állapot"
              required
              hint={
                canPublish
                  ? 'Csak a publikált projektek látszanak a nyilvános oldalon.'
                  : 'A publikáláshoz külön jogosultság kell — mentsd piszkozatként, és szólj egy szerkesztőnek.'
              }
            >
              {({ id, describedBy }) => (
                <Select
                  id={id}
                  value={values.publishStatus}
                  onChange={(event) => set('publishStatus', event.target.value as PublishStatus)}
                  aria-describedby={describedBy}
                >
                  {Object.entries(PUBLISH_STATUS)
                    .filter(([value]) => canPublish || value !== 'PUBLISHED' || initial.publishStatus === 'PUBLISHED')
                    .map(([value, config]) => (
                      <option key={value} value={value}>
                        {config.label}
                      </option>
                    ))}
                </Select>
              )}
            </Field>

            <Checkbox
              checked={values.isFeatured}
              onChange={(event) => set('isFeatured', event.target.checked)}
              label="Kiemelt projekt"
              description="A kiemelt projektek közül a legfrissebb kerül a főoldal hero szekciójába."
            />
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
            {projectId ? 'Mentés' : 'Létrehozás'}
          </Button>

          <Button variant="ghost" size="md" onClick={() => router.push('/admin/projektek')}>
            Mégse
          </Button>

          {draft.savedAt && (
            <span className="flex items-center gap-1.5 text-2xs text-mist-600">
              <Check className="size-3" aria-hidden />
              Piszkozat mentve
            </span>
          )}

          {canDelete && projectId && (
            <Button
              variant="danger"
              size="md"
              className="ml-auto"
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
        title="Projekt törlése"
        description="A projekt eltűnik a nyilvános oldalról, az epizódjai és kiadásai vele együtt. Az adat nem vész el véglegesen — később visszaállítható."
        confirmLabel="Törlés"
        requireTyped={values.slug}
      />
    </>
  );
}
