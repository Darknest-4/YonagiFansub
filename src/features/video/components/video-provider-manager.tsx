'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AlertTriangle, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { cn, slugify } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Field, Input, Select, Switch, Textarea } from '@/shared/ui/field';
import { EmptyState, InlineError } from '@/shared/ui/feedback';
import { ConfirmDialog, Modal } from '@/shared/ui/modal';
import { useToast } from '@/shared/ui/toast';
import { ApiError, apiFetch, type FieldErrors } from '@/shared/api/client';

export interface ProviderRow {
  id: string;
  slug: string;
  name: string;
  kind: 'HLS_PROXY' | 'DIRECT_FILE' | 'EMBED';
  embedTemplate: string | null;
  urlPatterns: string[];
  domains: string[];
  allowPopups: boolean;
  isEnabled: boolean;
  sortOrder: number;
  color: string | null;
  notes: string | null;
  sourceCount: number;
}

const KINDS = [
  { value: 'EMBED', label: 'Beágyazás (iframe)' },
  { value: 'DIRECT_FILE', label: 'Külső fájl (mp4 / m3u8)' },
];

interface Draft {
  slug: string;
  name: string;
  kind: string;
  embedTemplate: string;
  urlPatterns: string;
  domains: string;
  allowPopups: boolean;
  isEnabled: boolean;
  sortOrder: string;
  color: string;
  notes: string;
}

const EMPTY: Draft = {
  slug: '',
  name: '',
  kind: 'EMBED',
  embedTemplate: '',
  urlPatterns: '',
  domains: '',
  allowPopups: false,
  isEnabled: true,
  sortOrder: '100',
  color: '',
  notes: '',
};

/** Textareas hold one entry per line; empties are dropped rather than stored. */
function toLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Video provider registry.
 *
 * This screen is what makes "add as many providers as you like" true rather than
 * an API-only claim. The set of working filehosts changes faster than anyone
 * deploys, so adding one has to be a form.
 *
 * Two fields carry the weight and the form says why:
 *
 *   • **Domains** become that provider's frames' entire `Content-Security-Policy`.
 *     Nothing outside them can be loaded, which is what keeps the site-wide
 *     policy at `'self'` — and it is also why a missing domain looks exactly
 *     like the provider being down.
 *   • **URL patterns** are what let somebody paste the link they already have
 *     instead of hunting for a file id.
 *
 * Disabling is offered before deleting, and deleting a provider that is in use
 * is refused: turning one off takes every source it serves offline at once and
 * is reversible, which is what a team actually wants when a host goes bad.
 */
export function VideoProviderManager({
  initial,
  canWrite,
}: {
  initial: ProviderRow[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [providers, setProviders] = useState(initial);
  const [editing, setEditing] = useState<ProviderRow | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ProviderRow | null>(null);

  const reload = async () => {
    try {
      setProviders(await apiFetch<ProviderRow[]>('/api/v1/admin/video-providers'));
    } catch {
      router.refresh();
    }
  };

  const openNew = () => {
    setDraft({ ...EMPTY, sortOrder: String((providers.length + 1) * 10) });
    setEditing('new');
    setFieldErrors({});
    setFormError(null);
  };

  const openEdit = (provider: ProviderRow) => {
    setDraft({
      slug: provider.slug,
      name: provider.name,
      kind: provider.kind,
      embedTemplate: provider.embedTemplate ?? '',
      urlPatterns: provider.urlPatterns.join('\n'),
      domains: provider.domains.join('\n'),
      allowPopups: provider.allowPopups,
      isEnabled: provider.isEnabled,
      sortOrder: String(provider.sortOrder),
      color: provider.color ?? '',
      notes: provider.notes ?? '',
    });
    setEditing(provider);
    setFieldErrors({});
    setFormError(null);
  };

  const submit = async () => {
    setPending(true);
    setFieldErrors({});
    setFormError(null);

    const body = {
      slug: draft.slug.trim() || slugify(draft.name),
      name: draft.name.trim(),
      kind: draft.kind,
      embedTemplate: draft.embedTemplate.trim() || null,
      urlPatterns: toLines(draft.urlPatterns),
      domains: toLines(draft.domains),
      allowPopups: draft.allowPopups,
      isEnabled: draft.isEnabled,
      sortOrder: Number(draft.sortOrder) || 0,
      color: draft.color.trim() || null,
      notes: draft.notes.trim() || null,
    };

    try {
      if (editing && editing !== 'new') {
        await apiFetch(`/api/v1/admin/video-providers/${editing.id}`, { method: 'PUT', body });
        toast.success('Szolgáltató mentve');
      } else {
        await apiFetch('/api/v1/admin/video-providers', { method: 'POST', body });
        toast.success('Szolgáltató hozzáadva');
      }
      setEditing(null);
      await reload();
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

  /** The one-click response to a host going bad. */
  const toggle = async (provider: ProviderRow) => {
    try {
      await apiFetch(`/api/v1/admin/video-providers/${provider.id}`, {
        method: 'PUT',
        body: {
          slug: provider.slug,
          name: provider.name,
          kind: provider.kind,
          embedTemplate: provider.embedTemplate,
          urlPatterns: provider.urlPatterns,
          domains: provider.domains,
          allowPopups: provider.allowPopups,
          isEnabled: !provider.isEnabled,
          sortOrder: provider.sortOrder,
          color: provider.color,
          notes: provider.notes,
        },
      });
      toast.success(
        provider.isEnabled
          ? `${provider.name} kikapcsolva — a forrásai offline`
          : `${provider.name} bekapcsolva`,
      );
      await reload();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'A módosítás nem sikerült.');
    }
  };

  const remove = async (provider: ProviderRow) => {
    try {
      await apiFetch(`/api/v1/admin/video-providers/${provider.id}`, { method: 'DELETE' });
      toast.success('Szolgáltató törölve');
      await reload();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'A törlés nem sikerült.');
    }
  };

  return (
    <>
      {canWrite && (
        <div className="flex justify-end">
          <Button
            variant="primary"
            size="sm"
            onClick={openNew}
            leadingIcon={<Plus className="size-4" aria-hidden />}
          >
            Új szolgáltató
          </Button>
        </div>
      )}

      {providers.length === 0 ? (
        <EmptyState
          title="Nincs szolgáltató"
          description="Vegyél fel egyet, hogy beágyazott vagy külső forrásokat rendelhess az epizódokhoz."
          action={canWrite ? { label: 'Új szolgáltató', onClick: openNew } : undefined}
          compact
        />
      ) : (
        <ul className="space-y-2">
          {providers.map((provider) => (
            <li
              key={provider.id}
              className={cn(
                'rounded-xl border bg-ink-900/40 p-4 transition-opacity',
                provider.isEnabled ? 'border-ink-800' : 'border-ink-800/60 opacity-60',
              )}
            >
              <div className="flex flex-wrap items-start gap-3">
                <span
                  aria-hidden
                  className="mt-1 size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: provider.color ?? '#4e3a78' }}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-mist-100">{provider.name}</span>
                    <span className="font-mono text-2xs text-mist-600">{provider.slug}</span>
                    <Badge tone={provider.kind === 'EMBED' ? 'accent' : 'neutral'} size="sm">
                      {KINDS.find((k) => k.value === provider.kind)?.label ?? provider.kind}
                    </Badge>
                    {!provider.isEnabled && (
                      <Badge tone="warning" size="sm">
                        Kikapcsolva
                      </Badge>
                    )}
                    {provider.allowPopups && (
                      <Badge tone="warm" size="sm">
                        Popup engedélyezve
                      </Badge>
                    )}
                  </div>

                  {provider.embedTemplate && (
                    <p className="mt-1 truncate font-mono text-2xs text-mist-500">
                      {provider.embedTemplate}
                    </p>
                  )}

                  <p className="nums mt-1.5 text-2xs text-mist-600">
                    {provider.domains.length} domain · {provider.urlPatterns.length} URL-minta ·{' '}
                    {provider.sourceCount} forrás
                  </p>
                </div>

                {canWrite && (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => toggle(provider)}
                      aria-label={
                        provider.isEnabled
                          ? `${provider.name} kikapcsolása`
                          : `${provider.name} bekapcsolása`
                      }
                      className={provider.isEnabled ? 'text-success-400' : 'text-mist-500'}
                    >
                      <Power className="size-4" aria-hidden />
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => openEdit(provider)}
                      aria-label={`${provider.name} szerkesztése`}
                    >
                      <Pencil className="size-4" aria-hidden />
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setDeleting(provider)}
                      aria-label={`${provider.name} törlése`}
                    >
                      <Trash2 className="size-4 text-danger-400" aria-hidden />
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <Modal
          open
          onClose={() => setEditing(null)}
          title={editing === 'new' ? 'Új szolgáltató' : editing.name}
          description="A domainek és az URL-minták a legfontosabbak — az alábbi súgók elmagyarázzák, miért."
          size="lg"
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

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Név" required error={fieldErrors.name}>
                {({ id, invalid }) => (
                  <Input
                    id={id}
                    value={draft.name}
                    invalid={invalid}
                    onChange={(event) => {
                      const name = event.target.value;
                      setDraft((current) => ({
                        ...current,
                        name,
                        slug:
                          editing === 'new' && current.slug === slugify(current.name)
                            ? slugify(name)
                            : current.slug,
                      }));
                    }}
                  />
                )}
              </Field>

              <Field label="Slug" required error={fieldErrors.slug}>
                {({ id, invalid }) => (
                  <Input
                    id={id}
                    value={draft.slug}
                    invalid={invalid}
                    className="font-mono"
                    onChange={(event) => setDraft({ ...draft, slug: event.target.value })}
                  />
                )}
              </Field>
            </div>

            <Field label="Típus" required error={fieldErrors.kind}>
              {({ id }) => (
                <Select
                  id={id}
                  value={draft.kind}
                  onChange={(event) => setDraft({ ...draft, kind: event.target.value })}
                >
                  {KINDS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            {draft.kind === 'EMBED' && (
              <Field
                label="Beágyazási sablon"
                required
                hint="Az {id} helyére kerül a videó azonosítója. Pl. https://pelda.hu/e/{id}"
                error={fieldErrors.embedTemplate}
              >
                {({ id, invalid, describedBy }) => (
                  <Input
                    id={id}
                    value={draft.embedTemplate}
                    invalid={invalid}
                    aria-describedby={describedBy}
                    placeholder="https://pelda.hu/e/{id}"
                    className="font-mono"
                    onChange={(event) => setDraft({ ...draft, embedTemplate: event.target.value })}
                  />
                )}
              </Field>
            )}

            <Field
              label="Domainek"
              hint="Soronként egy, séma nélkül. Ebből épül a keret CSP-je: ami nincs itt, azt a böngésző nem tölti be. Az aldomainek automatikusan beleértendők."
              error={fieldErrors.domains}
            >
              {({ id, invalid, describedBy }) => (
                <Textarea
                  id={id}
                  rows={3}
                  value={draft.domains}
                  invalid={invalid}
                  aria-describedby={describedBy}
                  placeholder={'pelda.hu\npelda.net'}
                  className="font-mono text-xs"
                  onChange={(event) => setDraft({ ...draft, domains: event.target.value })}
                />
              )}
            </Field>

            <Field
              label="URL-minták"
              hint="Soronként egy reguláris kifejezés. Az első zárójeles csoport lesz a videó azonosítója — ettől elég bemásolni a linket. Pl. pelda\\.hu/e/([A-Za-z0-9]+)"
              error={fieldErrors.urlPatterns}
            >
              {({ id, invalid, describedBy }) => (
                <Textarea
                  id={id}
                  rows={3}
                  value={draft.urlPatterns}
                  invalid={invalid}
                  aria-describedby={describedBy}
                  placeholder="pelda\\.hu/(?:e|v)/([A-Za-z0-9]+)"
                  className="font-mono text-xs"
                  onChange={(event) => setDraft({ ...draft, urlPatterns: event.target.value })}
                />
              )}
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Sorrend" hint="Kisebb szám előrébb." error={fieldErrors.sortOrder}>
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    type="number"
                    min={0}
                    value={draft.sortOrder}
                    aria-describedby={describedBy}
                    onChange={(event) => setDraft({ ...draft, sortOrder: event.target.value })}
                  />
                )}
              </Field>

              <Field label="Szín" hint="Hexa, a listán jelölésre." error={fieldErrors.color}>
                {({ id }) => (
                  <Input
                    id={id}
                    value={draft.color}
                    placeholder="#f761a8"
                    className="font-mono"
                    onChange={(event) => setDraft({ ...draft, color: event.target.value })}
                  />
                )}
              </Field>
            </div>

            <Field label="Megjegyzés" error={fieldErrors.notes}>
              {({ id }) => (
                <Textarea
                  id={id}
                  rows={2}
                  value={draft.notes}
                  onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                />
              )}
            </Field>

            <div className="space-y-3 border-t border-ink-800 pt-4">
              <Switch
                checked={draft.isEnabled}
                onChange={(isEnabled) => setDraft({ ...draft, isEnabled })}
                label="Engedélyezve"
                description="Kikapcsolva az összes forrása azonnal offline lesz, és később visszakapcsolható."
              />

              {draft.kind === 'EMBED' && (
                <Switch
                  checked={draft.allowPopups}
                  onChange={(allowPopups) => setDraft({ ...draft, allowPopups })}
                  label="Felugró ablakok engedélyezése"
                  description="Alapból tiltjuk, mert a reklám-popup a te oldaladon rontja az élményt. Csak akkor kapcsold be, ha e nélkül nem indul el a lejátszó."
                />
              )}
            </div>
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
        title="Szolgáltató törlése"
        description={
          deleting && deleting.sourceCount > 0 ? (
            <span className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-ember-400" aria-hidden />
              <span>
                <strong className="text-mist-100">{deleting.sourceCount} forrás</strong> használja.
                A törlést a szerver elutasítja — kapcsold ki helyette, azzal minden forrása
                azonnal offline lesz, és később visszakapcsolható.
              </span>
            </span>
          ) : (
            <>
              <strong className="text-mist-100">{deleting?.name}</strong> véglegesen törlődik.
            </>
          )
        }
        confirmLabel="Törlés"
      />
    </>
  );
}
