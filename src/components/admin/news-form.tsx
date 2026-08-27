'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { PublishStatus } from '@prisma/client';
import { Check, Eye, Pencil, RotateCcw, Save, Trash2 } from 'lucide-react';
import { cn, formatRelative, readingMinutes, slugify } from '@/lib/utils';
import { renderMarkdown } from '@/lib/markdown';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field';
import { ConfirmDialog } from '@/components/ui/modal';
import { InlineError } from '@/components/ui/feedback';
import { PUBLISH_STATUS } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { ApiError, apiFetch, type FieldErrors } from '@/lib/client/api';
import { useFormDraft } from '@/lib/client/use-form-draft';
import type { NewsFormValues } from '@/lib/forms/defaults';

/**
 * News editor.
 *
 * Write/preview tabs rather than a side-by-side split: at admin-panel widths a
 * split editor gives both halves too little room, and the preview is something
 * you check at the end rather than watch continuously.
 *
 * The preview renders through the same `renderMarkdown` the public page uses, so
 * what an author sees is exactly what ships — including the fact that raw HTML
 * is escaped rather than rendered.
 */
export function NewsForm({
  postId,
  initial,
  categories,
  canDelete,
}: {
  postId?: string;
  initial: NewsFormValues;
  categories: Array<{ id: string; name: string }>;
  canDelete: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [values, setValues] = useState(initial);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(Boolean(initial.slug));
  const [confirmDelete, setConfirmDelete] = useState(false);

  const draft = useFormDraft<NewsFormValues>(`news:${postId ?? 'new'}`);

  const preview = useMemo(() => renderMarkdown(values.content), [values.content]);
  const minutes = useMemo(() => readingMinutes(values.content), [values.content]);

  const set = <K extends keyof NewsFormValues>(key: K, value: NewsFormValues[K]) => {
    setValues((current) => {
      const next = { ...current, [key]: value };
      if (key === 'title' && !slugTouched) next.slug = slugify(String(value));
      draft.save(next);
      return next;
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setFieldErrors({});
    setFormError(null);

    try {
      const result = await apiFetch<{ id: string }>(
        postId ? `/api/v1/admin/news/${postId}` : '/api/v1/admin/news',
        {
          method: postId ? 'PUT' : 'POST',
          body: {
            slug: values.slug,
            title: values.title,
            excerpt: values.excerpt,
            content: values.content,
            coverImageUrl: values.coverImageUrl,
            categoryId: values.categoryId || null,
            status: values.status,
            publishedAt: values.publishedAt || '',
            isPinned: values.isPinned,
          },
        },
      );

      draft.clear();
      toast.success(postId ? 'Hír mentve' : 'Hír létrehozva');

      if (postId) router.refresh();
      else router.push(`/admin/hirek/${result.id}`);
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
    if (!postId) return;
    await apiFetch(`/api/v1/admin/news/${postId}`, { method: 'DELETE' });
    draft.clear();
    toast.success('Hír törölve');
    router.push('/admin/hirek');
  };

  return (
    <>
      {draft.recovered && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-ember-400/30 bg-ember-400/8 px-4 py-3">
          <RotateCcw className="size-4 shrink-0 text-ember-400" aria-hidden />
          <p className="min-w-0 flex-1 text-sm text-ember-300">
            Mentetlen piszkozat {formatRelative(draft.recovered.savedAt)}.
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
          <CardBody className="space-y-4">
            <Field label="Cím" required error={fieldErrors.title}>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  inputSize="lg"
                  value={values.title}
                  onChange={(event) => set('title', event.target.value)}
                  required
                  maxLength={180}
                  invalid={invalid}
                  aria-describedby={describedBy}
                  placeholder="Miről szól a bejegyzés?"
                />
              )}
            </Field>

            <Field label="Slug" required hint="/hirek/<slug>" error={fieldErrors.slug}>
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

            <Field
              label="Kivonat"
              optionalLabel
              hint="A listákban és a megosztási kártyán jelenik meg. Üresen hagyva a szövegből generáljuk."
              error={fieldErrors.excerpt}
            >
              {({ id, describedBy, invalid }) => (
                <Textarea
                  id={id}
                  rows={2}
                  maxLength={320}
                  showCount
                  value={values.excerpt}
                  onChange={(event) => set('excerpt', event.target.value)}
                  invalid={invalid}
                  aria-describedby={describedBy}
                />
              )}
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Tartalom"
            description={`Markdown · ${minutes} perc olvasás`}
            action={
              <div role="tablist" aria-label="Szerkesztő nézet" className="flex gap-1">
                <TabButton
                  active={tab === 'write'}
                  onClick={() => setTab('write')}
                  icon={<Pencil className="size-3.5" aria-hidden />}
                >
                  Írás
                </TabButton>
                <TabButton
                  active={tab === 'preview'}
                  onClick={() => setTab('preview')}
                  icon={<Eye className="size-3.5" aria-hidden />}
                >
                  Előnézet
                </TabButton>
              </div>
            }
          />

          <CardBody>
            {tab === 'write' ? (
              <Field label={<span className="sr-only">Tartalom</span>} error={fieldErrors.content}>
                {({ id, invalid }) => (
                  <Textarea
                    id={id}
                    rows={20}
                    value={values.content}
                    onChange={(event) => set('content', event.target.value)}
                    required
                    invalid={invalid}
                    className="font-mono text-xs leading-relaxed"
                    placeholder={'## Alcím\n\nSzöveg **félkövéren**, [link](https://…), és lista:\n\n- első\n- második'}
                  />
                )}
              </Field>
            ) : values.content.trim() ? (
              <div
                className="prose-yonagi max-w-prose"
                dangerouslySetInnerHTML={{ __html: preview.html }}
              />
            ) : (
              <p className="py-12 text-center text-sm text-mist-500">
                Még nincs mit előnézni.
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Megjelenés" />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Kategória" optionalLabel>
                {({ id }) => (
                  <Select
                    id={id}
                    value={values.categoryId}
                    onChange={(event) => set('categoryId', event.target.value)}
                  >
                    <option value="">—</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
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
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Borítókép URL" optionalLabel error={fieldErrors.coverImageUrl}>
                {({ id, invalid }) => (
                  <Input
                    id={id}
                    type="url"
                    value={values.coverImageUrl}
                    onChange={(event) => set('coverImageUrl', event.target.value)}
                    invalid={invalid}
                  />
                )}
              </Field>

              <Field
                label="Publikálás időpontja"
                optionalLabel
                hint="Ütemezettnél ekkor jelenik meg."
                error={fieldErrors.publishedAt}
              >
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    type="datetime-local"
                    value={values.publishedAt}
                    onChange={(event) => set('publishedAt', event.target.value)}
                    invalid={invalid}
                    aria-describedby={describedBy}
                  />
                )}
              </Field>
            </div>

            <Checkbox
              checked={values.isPinned}
              onChange={(event) => set('isPinned', event.target.checked)}
              label="Kiemelt bejegyzés"
              description="A kiemelt hírek a lista élén maradnak, dátumtól függetlenül."
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
            {postId ? 'Mentés' : 'Létrehozás'}
          </Button>

          <Button variant="ghost" size="md" onClick={() => router.push('/admin/hirek')}>
            Mégse
          </Button>

          {draft.savedAt && (
            <span className="flex items-center gap-1.5 text-2xs text-mist-600">
              <Check className="size-3" aria-hidden />
              Piszkozat mentve
            </span>
          )}

          {canDelete && postId && (
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
        title="Hír törlése"
        description="A bejegyzés eltűnik a nyilvános oldalról. Az adat megmarad, később visszaállítható."
        confirmLabel="Törlés"
      />
    </>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-2xs font-medium transition-colors duration-fast',
        active
          ? 'bg-tide-400/15 text-tide-200'
          : 'text-mist-500 hover:bg-ink-800 hover:text-mist-200',
      )}
    >
      {icon}
      {children}
    </button>
  );
}
