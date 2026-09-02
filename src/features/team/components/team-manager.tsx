'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Pencil,
  Plus,
  Star,
  Trash2,
  Users,
} from 'lucide-react';
import { cn, formatDate, slugify } from '@/shared/lib/utils';
import { Avatar } from '@/shared/ui/avatar';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Field, Input, Switch, Textarea } from '@/shared/ui/field';
import { EmptyState, InlineError } from '@/shared/ui/feedback';
import { ConfirmDialog, Modal } from '@/shared/ui/modal';
import { useToast } from '@/shared/ui/toast';
import { ImageField } from '@/features/media/components/image-field';
import { ApiError, apiFetch, type FieldErrors } from '@/shared/api/client';

export interface TeamPositionOption {
  id: string;
  key: string;
  name: string;
  color: string | null;
}

export interface TeamCandidateView {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  linkedMemberId: string | null;
}

export interface LinkedAccount {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface AdminTeamMemberView {
  id: string;
  slug: string;
  name: string;
  /** The login account this credit belongs to, when one is linked. */
  account: LinkedAccount | null;
  tagline: string | null;
  bio: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  accentColor: string | null;
  socials: Record<string, string>;
  joinedAt: string | null;
  isActive: boolean;
  isFounder: boolean;
  sortOrder: number;
  projectCount: number;
  /** Ordered, primary first — the order is what marks the primary position. */
  positionIds: string[];
}

interface Draft {
  userId: string | null;
  account: LinkedAccount | null;
  slug: string;
  name: string;
  tagline: string;
  bio: string;
  avatarUrl: string;
  bannerUrl: string;
  accentColor: string;
  discord: string;
  x: string;
  anilist: string;
  myanimelist: string;
  website: string;
  joinedAt: string;
  isActive: boolean;
  isFounder: boolean;
  sortOrder: string;
  positionIds: string[];
}

const EMPTY_DRAFT: Draft = {
  userId: null,
  account: null,
  slug: '',
  name: '',
  tagline: '',
  bio: '',
  avatarUrl: '',
  bannerUrl: '',
  accentColor: '',
  discord: '',
  x: '',
  anilist: '',
  myanimelist: '',
  website: '',
  joinedAt: '',
  isActive: true,
  isFounder: false,
  sortOrder: '0',
  positionIds: [],
};

function toDraft(member: AdminTeamMemberView): Draft {
  return {
    userId: member.account?.id ?? null,
    account: member.account,
    slug: member.slug,
    name: member.name,
    tagline: member.tagline ?? '',
    bio: member.bio ?? '',
    avatarUrl: member.avatarUrl ?? '',
    bannerUrl: member.bannerUrl ?? '',
    accentColor: member.accentColor ?? '',
    discord: member.socials.discord ?? '',
    x: member.socials.x ?? '',
    anilist: member.socials.anilist ?? '',
    myanimelist: member.socials.myanimelist ?? '',
    website: member.socials.website ?? '',
    joinedAt: member.joinedAt ? member.joinedAt.slice(0, 10) : '',
    isActive: member.isActive,
    isFounder: member.isFounder,
    sortOrder: String(member.sortOrder),
    positionIds: member.positionIds,
  };
}

/** Drops empty strings: the API treats a missing key and an empty one differently. */
function packSocials(draft: Draft): Record<string, string> {
  const entries: Array<[string, string]> = [
    ['discord', draft.discord],
    ['x', draft.x],
    ['anilist', draft.anilist],
    ['myanimelist', draft.myanimelist],
    ['website', draft.website],
  ];
  return Object.fromEntries(entries.filter(([, value]) => value.trim().length > 0));
}

/**
 * Team manager.
 *
 * The public roster and the admin accounts are two different things and this
 * screen only owns the first. A team member is a **credit**: a name, an avatar
 * and the jobs they do, shown on `/csapat` and attachable to an episode's staff
 * list. It exists whether or not that person ever logs in, which is what makes
 * it possible to credit someone who left, or who only ever sent files over
 * Discord. What somebody may *do* in this admin is their account's role, on
 * `/admin/felhasznalok`.
 *
 * Positions are ordered, and the order is the meaning: the first one is the
 * primary, which is what groups the member on the public page. That is why they
 * are moved with explicit up/down buttons rather than checkboxes — a checkbox
 * set has no order to express, and drag-and-drop cannot be operated from a
 * keyboard or a phone.
 */
export function TeamManager({
  members,
  positions,
  canDelete,
}: {
  members: AdminTeamMemberView[];
  positions: TeamPositionOption[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [editing, setEditing] = useState<AdminTeamMemberView | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminTeamMemberView | null>(null);

  const openCreate = () => {
    setDraft({ ...EMPTY_DRAFT, sortOrder: String(members.length) });
    setEditing(null);
    setCreating(true);
    setFieldErrors({});
    setFormError(null);
  };

  const openEdit = (member: AdminTeamMemberView) => {
    setDraft(toDraft(member));
    setEditing(member);
    setCreating(false);
    setFieldErrors({});
    setFormError(null);
  };

  const close = () => {
    setEditing(null);
    setCreating(false);
  };

  const submit = async () => {
    /*
      A new credit must belong to an account. Editing stays permissive: members
      created before this rule (and the schema's documented guest case) still
      have to be savable, and refusing to save a row you did not create is a
      worse outcome than an unlinked row continuing to exist.
    */
    if (!editing && !draft.userId) {
      setFieldErrors({ userId: ['Válassz egy fiókot a listából.'] });
      setFormError(null);
      return;
    }

    setPending(true);
    setFieldErrors({});
    setFormError(null);

    const body = {
      userId: draft.userId,
      slug: draft.slug.trim() || slugify(draft.name),
      name: draft.name.trim(),
      tagline: draft.tagline.trim() || null,
      bio: draft.bio.trim() || null,
      avatarUrl: draft.avatarUrl.trim() || null,
      bannerUrl: draft.bannerUrl.trim() || null,
      accentColor: draft.accentColor.trim() || null,
      socials: packSocials(draft),
      joinedAt: draft.joinedAt || null,
      leftAt: null,
      isActive: draft.isActive,
      isFounder: draft.isFounder,
      sortOrder: Number(draft.sortOrder) || 0,
      positionIds: draft.positionIds,
    };

    try {
      if (editing) {
        await apiFetch(`/api/v1/admin/team/${editing.id}`, { method: 'PUT', body });
        toast.success('Csapattag mentve');
      } else {
        await apiFetch('/api/v1/admin/team', { method: 'POST', body });
        toast.success('Csapattag hozzáadva');
      }
      close();
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

  const remove = async (member: AdminTeamMemberView) => {
    try {
      await apiFetch(`/api/v1/admin/team/${member.id}`, { method: 'DELETE' });
      toast.success(`${member.name} eltávolítva`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'A törlés nem sikerült.');
    }
  };

  const byId = new Map(positions.map((position) => [position.id, position]));

  return (
    <>
      <div className="flex justify-end">
        <Button
          variant="primary"
          size="sm"
          onClick={openCreate}
          leadingIcon={<Plus className="size-4" aria-hidden />}
        >
          Új csapattag
        </Button>
      </div>

      {members.length === 0 ? (
        <EmptyState
          icon={<Users className="size-6" aria-hidden />}
          title="Nincs csapattag"
          description="Vedd fel az első tagot, hogy a stáblisták kitölthetők legyenek."
          action={{ label: 'Új csapattag', onClick: openCreate }}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {members.map((member) => (
            <li
              key={member.id}
              className="min-w-0 rounded-xl border border-ink-800 bg-ink-900/40 p-4"
            >
              <div className="flex items-start gap-3">
                <Avatar name={member.name} src={member.avatarUrl} size="md" />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-mist-100">
                      {member.name}
                    </span>
                    {member.isFounder && (
                      <Badge tone="warm" size="sm">
                        Alapító
                      </Badge>
                    )}
                    {!member.isActive && (
                      <Badge tone="neutral" size="sm">
                        Inaktív
                      </Badge>
                    )}
                  </div>

                  {member.account ? (
                    <p className="truncate font-mono text-2xs text-mist-500">
                      @{member.account.username}
                    </p>
                  ) : (
                    <p className="text-2xs text-ember-400">Nincs fiók összekötve</p>
                  )}

                  {member.tagline && (
                    <p className="mt-0.5 truncate text-2xs text-mist-500">{member.tagline}</p>
                  )}

                  <ul className="mt-2 flex flex-wrap gap-1">
                    {member.positionIds.map((id, index) => {
                      const position = byId.get(id);
                      if (!position) return null;
                      return (
                        <li key={id}>
                          <Badge tone={index === 0 ? 'accent' : 'neutral'} size="sm">
                            {position.name}
                          </Badge>
                        </li>
                      );
                    })}
                  </ul>

                  <p className="nums mt-2.5 text-2xs text-mist-600">
                    {member.projectCount} közreműködés
                    {member.joinedAt && ` · csatlakozott ${formatDate(member.joinedAt)}`}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-1 border-t border-ink-800 pt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openEdit(member)}
                  leadingIcon={<Pencil className="size-3.5" aria-hidden />}
                >
                  Szerkesztés
                </Button>

                <Link
                  href={`/csapat/${member.slug}`}
                  target="_blank"
                  aria-label={`${member.name} nyilvános profilja`}
                  className="ml-auto rounded-md p-2 text-mist-600 transition-colors hover:bg-ink-800 hover:text-mist-300"
                >
                  <ExternalLink className="size-3.5" aria-hidden />
                </Link>

                {canDelete && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setConfirmDelete(member)}
                    aria-label={`${member.name} eltávolítása`}
                  >
                    <Trash2 className="size-3.5 text-danger-400" aria-hidden />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {(creating || editing) && (
        <Modal
          open
          onClose={close}
          title={editing ? editing.name : 'Új csapattag'}
          description="A pozíciók sorrendje számít — az első az elsődleges, az szerinti csoportban jelenik meg a nyilvános oldalon."
          size="lg"
          dismissible={!pending}
          footer={
            <>
              <Button variant="ghost" size="sm" onClick={close} disabled={pending}>
                Mégse
              </Button>
              <Button variant="primary" size="sm" onClick={submit} loading={pending}>
                Mentés
              </Button>
            </>
          }
        >
          <div className="space-y-5">
            {formError && <InlineError message={formError} />}

            <AccountPicker
              account={draft.account}
              error={fieldErrors.userId}
              onSelect={(account) =>
                setDraft((current) => ({
                  ...current,
                  userId: account.id,
                  account,
                  /*
                    The account seeds the credit. Only fields the user has not
                    already typed into are filled, so re-picking an account to
                    fix a mislink does not silently discard a fansub alias or a
                    hand-picked avatar.
                  */
                  name: current.name.trim() || account.displayName,
                  slug: current.slug.trim() || slugify(account.username),
                  avatarUrl: current.avatarUrl.trim() || account.avatarUrl || '',
                }))
              }
              onClear={() => setDraft((current) => ({ ...current, userId: null, account: null }))}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Megjelenített név"
                required
                hint="A fiókból jön, de felülírható, ha más néven kreditelitek."
                error={fieldErrors.name}
              >
                {({ id, invalid, describedBy }) => (
                  <Input
                    id={id}
                    value={draft.name}
                    invalid={invalid}
                    aria-describedby={describedBy}
                    onChange={(event) => {
                      const name = event.target.value;
                      // The slug follows the name until somebody edits it by
                      // hand; on an existing member it is left alone, because
                      // changing it breaks every link already shared.
                      setDraft((current) => ({
                        ...current,
                        name,
                        slug: !editing && current.slug === slugify(current.name)
                          ? slugify(name)
                          : current.slug,
                      }));
                    }}
                  />
                )}
              </Field>

              <Field
                label="Slug"
                required
                hint={editing ? 'A módosítás megtöri a már megosztott linkeket.' : 'A profil URL-je.'}
                error={fieldErrors.slug}
              >
                {({ id, invalid, describedBy }) => (
                  <Input
                    id={id}
                    value={draft.slug}
                    invalid={invalid}
                    aria-describedby={describedBy}
                    onChange={(event) => setDraft({ ...draft, slug: event.target.value })}
                  />
                )}
              </Field>
            </div>

            <Field label="Mottó" hint="Egy sor a kártyán." error={fieldErrors.tagline}>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  value={draft.tagline}
                  aria-describedby={describedBy}
                  onChange={(event) => setDraft({ ...draft, tagline: event.target.value })}
                />
              )}
            </Field>

            <PositionPicker
              positions={positions}
              selected={draft.positionIds}
              error={fieldErrors.positionIds}
              onChange={(positionIds) => setDraft({ ...draft, positionIds })}
            />

            <Field label="Bemutatkozás" hint="Markdown támogatott." error={fieldErrors.bio}>
              {({ id, describedBy }) => (
                <Textarea
                  id={id}
                  rows={4}
                  value={draft.bio}
                  aria-describedby={describedBy}
                  onChange={(event) => setDraft({ ...draft, bio: event.target.value })}
                />
              )}
            </Field>

            <ImageField
              label="Profilkép"
              value={draft.avatarUrl}
              folder="csapat"
              aspect="square"
              error={fieldErrors.avatarUrl}
              onChange={(value) => setDraft({ ...draft, avatarUrl: value })}
            />

            <fieldset className="space-y-4">
              <legend className="text-2xs font-bold tracking-[0.18em] text-mist-500 uppercase">
                Elérhetőségek
              </legend>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Discord" error={fieldErrors['socials.discord']}>
                  {({ id }) => (
                    <Input
                      id={id}
                      value={draft.discord}
                      placeholder="felhasznaloi-azonosito"
                      onChange={(event) => setDraft({ ...draft, discord: event.target.value })}
                    />
                  )}
                </Field>

                <Field label="AniList" error={fieldErrors['socials.anilist']}>
                  {({ id }) => (
                    <Input
                      id={id}
                      value={draft.anilist}
                      onChange={(event) => setDraft({ ...draft, anilist: event.target.value })}
                    />
                  )}
                </Field>

                <Field label="MyAnimeList" error={fieldErrors['socials.myanimelist']}>
                  {({ id }) => (
                    <Input
                      id={id}
                      value={draft.myanimelist}
                      onChange={(event) => setDraft({ ...draft, myanimelist: event.target.value })}
                    />
                  )}
                </Field>

                <Field label="X" error={fieldErrors['socials.x']}>
                  {({ id }) => (
                    <Input
                      id={id}
                      value={draft.x}
                      onChange={(event) => setDraft({ ...draft, x: event.target.value })}
                    />
                  )}
                </Field>
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Csatlakozás dátuma" error={fieldErrors.joinedAt}>
                {({ id }) => (
                  <Input
                    id={id}
                    type="date"
                    value={draft.joinedAt}
                    onChange={(event) => setDraft({ ...draft, joinedAt: event.target.value })}
                  />
                )}
              </Field>

              <Field
                label="Sorrend"
                hint="Kisebb szám előrébb."
                error={fieldErrors.sortOrder}
              >
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
            </div>

            <div className="space-y-3 border-t border-ink-800 pt-4">
              <Switch
                checked={draft.isActive}
                onChange={(isActive) => setDraft({ ...draft, isActive })}
                label="Aktív tag"
                description="Az inaktív tagok profilja megmarad, de lekerülnek a nyilvános listáról."
              />
              <Switch
                checked={draft.isFounder}
                onChange={(isFounder) => setDraft({ ...draft, isFounder })}
                label="Alapító"
                description="Csillaggal jelöljük, és a lista elejére kerül."
              />
            </div>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (confirmDelete) await remove(confirmDelete);
          setConfirmDelete(null);
        }}
        title="Csapattag eltávolítása"
        description={
          <>
            <strong className="text-mist-100">{confirmDelete?.name}</strong> lekerül a nyilvános
            listáról. A korábbi stáblistákban a neve megmarad — a közreműködés ténye nem
            visszamenőleges.
          </>
        }
        confirmLabel="Eltávolítás"
      />
    </>
  );
}

/**
 * Position assignment.
 *
 * Two lists rather than a checkbox grid: the selected side is ordered and the
 * order is data, so it needs somewhere to live where moving an item is possible.
 * The first row wears the star because "primary" is not a separate flag anybody
 * sets — it is simply whichever position is at the top.
 */
function PositionPicker({
  positions,
  selected,
  error,
  onChange,
}: {
  positions: TeamPositionOption[];
  selected: string[];
  error?: string | string[];
  onChange: (next: string[]) => void;
}) {
  const byId = new Map(positions.map((position) => [position.id, position]));
  const available = positions.filter((position) => !selected.includes(position.id));

  const move = (index: number, delta: number) => {
    const next = [...selected];
    const target = index + delta;
    const current = next[index];
    const other = next[target];
    if (current === undefined || other === undefined) return;
    next[index] = other;
    next[target] = current;
    onChange(next);
  };

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-mist-200">Pozíciók</p>

      {selected.length === 0 ? (
        <p className="rounded-lg border border-dashed border-ink-700 px-4 py-3 text-2xs text-mist-500">
          Még nincs pozíció kiválasztva. Az alábbiakból adj hozzá legalább egyet.
        </p>
      ) : (
        <ol className="space-y-1.5">
          {selected.map((id, index) => {
            const position = byId.get(id);
            if (!position) return null;

            return (
              <li
                key={id}
                className="flex items-center gap-2 rounded-lg border border-ink-800 bg-ink-900/60 py-1.5 pr-1.5 pl-3"
              >
                {index === 0 ? (
                  <Star
                    className="size-3.5 shrink-0 fill-ember-400/80 text-ember-400"
                    aria-label="Elsődleges pozíció"
                  />
                ) : (
                  <span aria-hidden className="size-3.5 shrink-0" />
                )}

                <span
                  className="min-w-0 flex-1 truncate text-sm"
                  style={{ color: position.color ?? undefined }}
                >
                  {position.name}
                </span>

                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  aria-label={`${position.name} feljebb`}
                >
                  <ArrowUp className="size-3.5" aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={index === selected.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label={`${position.name} lejjebb`}
                >
                  <ArrowDown className="size-3.5" aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onChange(selected.filter((entry) => entry !== id))}
                  aria-label={`${position.name} eltávolítása`}
                >
                  <Trash2 className="size-3.5 text-danger-400" aria-hidden />
                </Button>
              </li>
            );
          })}
        </ol>
      )}

      {available.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {available.map((position) => (
            <button
              key={position.id}
              type="button"
              onClick={() => onChange([...selected, position.id])}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border border-ink-700 bg-ink-900/60 px-3 py-2 text-2xs',
                'text-mist-300 transition-colors duration-fast hover:border-bloom-500/40 hover:text-bloom-200',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bloom-400 sm:py-1.5',
              )}
            >
              <Plus className="size-3" aria-hidden />
              {position.name}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-2 text-2xs text-danger-400">
          {Array.isArray(error) ? error[0] : error}
        </p>
      )}
    </div>
  );
}

/**
 * Account picker.
 *
 * A team credit belongs to a person, and on this site a person is an account.
 * Typing a name by hand produced a record joined to nothing: the public profile
 * could not link back, the avatar had to be re-uploaded, and two spellings of
 * the same person became two members. Picking the account instead makes the
 * credit and the login the same entity, which is what the schema already
 * modelled and only the form did not.
 *
 * Search runs against `team:write`, not `user:read`: an editor manages the
 * roster without any business reading user administration, so the endpoint
 * returns handles and avatars and nothing else.
 *
 * Accounts that already hold a member profile are listed but not selectable.
 * Hiding them would make somebody searching for a colleague conclude they have
 * no account, when the truth is they are already on the roster.
 */
function AccountPicker({
  account,
  error,
  onSelect,
  onClear,
}: {
  account: LinkedAccount | null;
  error?: string | string[];
  onSelect: (account: LinkedAccount) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TeamCandidateView[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  // Debounced so a fast typist issues one request, not one per keystroke. The
  // cleanup makes a superseded search a no-op rather than a late overwrite.
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const path = `/api/v1/admin/team/candidates${query ? `?q=${encodeURIComponent(query)}` : ''}`;
        const data = await apiFetch<TeamCandidateView[]>(path);
        if (!cancelled) setResults(data);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open]);

  if (account) {
    return (
      <div>
        <p className="mb-2 text-sm font-medium text-mist-200">Fiók</p>
        <div className="flex items-center gap-3 rounded-xl border border-bloom-500/25 bg-bloom-500/[0.06] p-3">
          <Avatar name={account.displayName} src={account.avatarUrl} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-mist-100">{account.displayName}</p>
            <p className="truncate font-mono text-2xs text-mist-500">@{account.username}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClear}>
            Leválasztás
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-mist-200">
        Fiók <span className="text-bloom-400">*</span>
      </p>

      <Input
        value={query}
        placeholder="Keresés név vagy felhasználónév szerint…"
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setOpen(true)}
        aria-label="Fiók keresése"
      />

      {open && (
        <div className="mt-2 max-h-60 overflow-y-auto rounded-xl border border-ink-800 bg-ink-900/60">
          {loading && results.length === 0 ? (
            <p className="px-3 py-3 text-2xs text-mist-500">Keresés…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-3 text-2xs text-mist-500">
              Nincs találat. Csak regisztrált fiók köthető csapattaghoz.
            </p>
          ) : (
            <ul className="divide-y divide-ink-800">
              {results.map((candidate) => {
                const taken = candidate.linkedMemberId !== null;

                return (
                  <li key={candidate.id}>
                    <button
                      type="button"
                      disabled={taken}
                      onClick={() => {
                        onSelect({
                          id: candidate.id,
                          username: candidate.username,
                          displayName: candidate.displayName,
                          avatarUrl: candidate.avatarUrl,
                        });
                        setOpen(false);
                        setQuery('');
                      }}
                      className={cn(
                        'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
                        taken
                          ? 'cursor-not-allowed opacity-50'
                          : 'hover:bg-ink-850 focus-visible:bg-ink-850 focus-visible:outline-none',
                      )}
                    >
                      <Avatar name={candidate.displayName} src={candidate.avatarUrl} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-mist-100">
                          {candidate.displayName}
                        </span>
                        <span className="block truncate font-mono text-2xs text-mist-600">
                          @{candidate.username}
                        </span>
                      </span>
                      {taken && (
                        <Badge tone="neutral" size="sm">
                          Már tag
                        </Badge>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {error && (
        <p className="mt-2 text-2xs text-danger-400">
          {Array.isArray(error) ? error[0] : error}
        </p>
      )}
    </div>
  );
}
