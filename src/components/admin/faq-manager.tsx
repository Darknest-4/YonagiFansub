'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ChevronDown, EyeOff, Plus, Save, Trash2 } from 'lucide-react';
import { cn, formatRelative } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/field';
import { EmptyState, InlineError } from '@/components/ui/feedback';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { ApiError, apiFetch, type FieldErrors } from '@/lib/client/api';

export interface FaqEntryView {
  id: string;
  question: string;
  answer: string;
  category: string;
  sortOrder: number;
  isPublished: boolean;
  updatedAt: string;
}

export const FAQ_CATEGORY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'general', label: 'Általános' },
  { value: 'download', label: 'Letöltés' },
  { value: 'projects', label: 'Projektek' },
  { value: 'team', label: 'Csapat' },
  { value: 'technical', label: 'Technikai' },
];

interface Draft {
  question: string;
  answer: string;
  category: string;
  sortOrder: string;
  isPublished: boolean;
}

const EMPTY_DRAFT: Draft = {
  question: '',
  answer: '',
  category: 'general',
  sortOrder: '',
  isPublished: true,
};

function toDraft(entry: FaqEntryView): Draft {
  return {
    question: entry.question,
    answer: entry.answer,
    category: entry.category,
    sortOrder: String(entry.sortOrder),
    isPublished: entry.isPublished,
  };
}

/**
 * FAQ manager.
 *
 * Edited in place rather than on a detail page per entry: an FAQ answer is two
 * sentences, and a round trip through a separate route for each one would cost
 * more than the whole page is worth. One accordion, one row open at a time,
 * saved individually.
 *
 * Ordering is a plain number rather than drag-and-drop. Entries are grouped by
 * category and there are rarely more than a handful in each; a number field is
 * keyboard accessible, needs no pointer, and cannot lose an item behind a
 * mis-drop.
 */
export function FaqManager({ entries }: { entries: FaqEntryView[] }) {
  const router = useRouter();
  const toast = useToast();

  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<FaqEntryView | null>(null);

  const openEntry = (entry: FaqEntryView) => {
    setCreating(false);
    setFieldErrors({});
    setFormError(null);
    if (openId === entry.id) {
      setOpenId(null);
      return;
    }
    setOpenId(entry.id);
    setDraft(toDraft(entry));
  };

  const startCreate = () => {
    setOpenId(null);
    setFieldErrors({});
    setFormError(null);
    setDraft(EMPTY_DRAFT);
    setCreating(true);
  };

  const save = async (id?: string) => {
    setPending(true);
    setFieldErrors({});
    setFormError(null);

    try {
      await apiFetch(id ? `/api/v1/admin/faq/${id}` : '/api/v1/admin/faq', {
        method: id ? 'PUT' : 'POST',
        body: {
          question: draft.question,
          answer: draft.answer,
          category: draft.category,
          sortOrder: draft.sortOrder === '' ? null : Number(draft.sortOrder),
          isPublished: draft.isPublished,
        },
      });

      toast.success(id ? 'Bejegyzés mentve' : 'Bejegyzés létrehozva');
      setOpenId(null);
      setCreating(false);
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

  const remove = async () => {
    if (!confirmDelete) return;
    try {
      await apiFetch(`/api/v1/admin/faq/${confirmDelete.id}`, { method: 'DELETE' });
      toast.success('Bejegyzés törölve');
      setOpenId(null);
      router.refresh();
    } catch (error) {
      toast.error('A törlés nem sikerült', error instanceof Error ? error.message : undefined);
    } finally {
      setConfirmDelete(null);
    }
  };

  const grouped = FAQ_CATEGORY_OPTIONS.map((option) => ({
    ...option,
    items: entries.filter((entry) => entry.category === option.value),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button
          variant="primary"
          size="sm"
          leadingIcon={<Plus className="size-4" aria-hidden />}
          onClick={startCreate}
        >
          Új kérdés
        </Button>
      </div>

      {creating && (
        <div className="rounded-xl border border-tide-400/30 bg-tide-400/5 p-4">
          <h2 className="mb-3 text-sm font-semibold text-tide-200">Új bejegyzés</h2>
          <DraftFields
            draft={draft}
            setDraft={setDraft}
            fieldErrors={fieldErrors}
            formError={formError}
          />
          <div className="mt-4 flex gap-2">
            <Button
              variant="primary"
              size="sm"
              loading={pending}
              leadingIcon={<Save className="size-4" aria-hidden />}
              onClick={() => void save()}
            >
              Létrehozás
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setCreating(false)}>
              Mégse
            </Button>
          </div>
        </div>
      )}

      {entries.length === 0 && !creating ? (
        <EmptyState
          title="Még nincs GYIK bejegyzés"
          description="A gyakori kérdések a nyilvános /gyik oldalon jelennek meg, kategóriánként csoportosítva."
        />
      ) : (
        grouped.map((group) => (
          <section key={group.value}>
            <h2 className="mb-2 text-2xs font-bold tracking-[0.18em] text-mist-500 uppercase">
              {group.label}
              <span className="nums ml-2 font-normal text-mist-600">{group.items.length}</span>
            </h2>

            <ul className="divide-y divide-ink-800 overflow-hidden rounded-xl border border-ink-800 bg-ink-900/40">
              {group.items.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => openEntry(entry)}
                    aria-expanded={openId === entry.id}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-ink-850/60"
                  >
                    <ChevronDown
                      className={cn(
                        'size-4 shrink-0 text-mist-500 transition-transform duration-fast',
                        openId === entry.id && 'rotate-180',
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-mist-100">
                      {entry.question}
                    </span>
                    {!entry.isPublished && (
                      <Badge tone="neutral" size="sm" icon={<EyeOff className="size-3" aria-hidden />}>
                        Rejtett
                      </Badge>
                    )}
                    <span className="nums hidden text-2xs text-mist-600 sm:block">
                      #{entry.sortOrder} · {formatRelative(entry.updatedAt)}
                    </span>
                  </button>

                  {openId === entry.id && (
                    <div className="border-t border-ink-800 bg-ink-950/40 p-4">
                      <DraftFields
                        draft={draft}
                        setDraft={setDraft}
                        fieldErrors={fieldErrors}
                        formError={formError}
                      />
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          variant="primary"
                          size="sm"
                          loading={pending}
                          leadingIcon={<Save className="size-4" aria-hidden />}
                          onClick={() => void save(entry.id)}
                        >
                          Mentés
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setOpenId(null)}>
                          Mégse
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          className="ml-auto"
                          leadingIcon={<Trash2 className="size-4" aria-hidden />}
                          onClick={() => setConfirmDelete(entry)}
                        >
                          Törlés
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={remove}
        title="Bejegyzés törlése"
        description={
          confirmDelete
            ? `„${confirmDelete.question}" véglegesen törlődik. Ha csak elrejtenéd, kapcsold ki a „Publikált" kapcsolót.`
            : ''
        }
        confirmLabel="Törlés"
        tone="danger"
      />
    </div>
  );
}

function DraftFields({
  draft,
  setDraft,
  fieldErrors,
  formError,
}: {
  draft: Draft;
  setDraft: (draft: Draft) => void;
  fieldErrors: FieldErrors;
  formError: string | null;
}) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft({ ...draft, [key]: value });

  return (
    <div className="space-y-4">
      {formError && <InlineError message={formError} />}

      <Field label="Kérdés" required error={fieldErrors.question}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            value={draft.question}
            onChange={(event) => set('question', event.target.value)}
            maxLength={240}
            invalid={invalid}
            aria-describedby={describedBy}
          />
        )}
      </Field>

      <Field
        label="Válasz"
        required
        hint="Markdown támogatott — ugyanaz a renderer, mint a híreknél."
        error={fieldErrors.answer}
      >
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            rows={5}
            maxLength={4000}
            showCount
            value={draft.answer}
            onChange={(event) => set('answer', event.target.value)}
            invalid={invalid}
            aria-describedby={describedBy}
          />
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kategória" error={fieldErrors.category}>
          {({ id }) => (
            <Select
              id={id}
              value={draft.category}
              onChange={(event) => set('category', event.target.value)}
            >
              {FAQ_CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field
          label="Sorrend"
          optionalLabel
          hint="Kisebb szám előrébb. Üresen hagyva a kategória végére kerül."
          error={fieldErrors.sortOrder}
        >
          {({ id, invalid }) => (
            <Input
              id={id}
              type="number"
              min={0}
              max={9999}
              value={draft.sortOrder}
              onChange={(event) => set('sortOrder', event.target.value)}
              invalid={invalid}
            />
          )}
        </Field>
      </div>

      <Switch
        checked={draft.isPublished}
        onChange={(checked) => set('isPublished', checked)}
        label="Publikált"
        description="Kikapcsolva a bejegyzés megmarad, de nem jelenik meg a /gyik oldalon."
      />
    </div>
  );
}
