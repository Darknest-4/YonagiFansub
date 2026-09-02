'use client';

import Link from 'next/link';
import { useState } from 'react';
import { MessageSquare, Pencil, Reply, Trash2 } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { ApiError, apiFetch, buildQuery } from '@/lib/client/api';
import { formatRelative } from '@/lib/utils';
import { cn } from '@/lib/utils';

/**
 * The discussion under a project, an episode or a news post.
 *
 * The first page arrives rendered from the server, so the section is readable
 * before any JavaScript runs and there is no flash of a loading state on the
 * common path; the client takes over for posting, replying and paging.
 *
 * ## Who gets a box to type in
 *
 * Three states, and each says which one it is rather than showing a disabled
 * form and leaving the reader to guess:
 *
 *   • signed out → a link to log in that comes back to this page,
 *   • signed in but unverified → what to do about it (the API refuses these,
 *     so offering the box would only produce a rejection),
 *   • verified → the box.
 *
 * A comment awaiting moderation is **not** inserted into the list. Showing it
 * would mean showing the author something no one else can see, and the first
 * thing they would do is reload and think it was lost.
 */

const MAX_LENGTH = 2000;

export interface CommentAuthorView {
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface CommentView {
  id: string;
  body: string;
  createdAt: string | Date;
  /** Kitöltve, ha a szerző utólag módosította a szöveget. */
  editedAt: string | Date | null;
  parentId: string | null;
  /** A szerző törölte, de válaszok lógnak alatta — a helye megmarad. */
  deleted: boolean;
  /** Null a törölt fiókok hozzászólásainál. */
  user: CommentAuthorView | null;
}

export interface CommentThreadView extends CommentView {
  replies: CommentView[];
}

export type CommentTargetView =
  | { projectId: string }
  | { episodeId: string }
  | { newsPostId: string };

interface Viewer {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isVerified: boolean;
}

interface PageMeta {
  page: number;
  totalPages: number;
  hasNext: boolean;
}

export function CommentBoard({
  target,
  initialThreads,
  initialMeta,
  total,
  viewer,
  requiresApproval,
  editMinutes,
  profilesPublic,
  returnTo,
}: {
  target: CommentTargetView;
  initialThreads: CommentThreadView[];
  initialMeta: PageMeta;
  total: number;
  viewer: Viewer | null;
  requiresApproval: boolean;
  /** The `commentEditMinutes` setting. Zero means the edit button is never drawn. */
  editMinutes: number;
  /** The `profilesPublic` setting. Off, and the author's name is plain text. */
  profilesPublic: boolean;
  returnTo: string;
}) {
  const toast = useToast();

  const [threads, setThreads] = useState(initialThreads);
  const [meta, setMeta] = useState(initialMeta);
  const [count, setCount] = useState(total);
  const [loadingMore, setLoadingMore] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const query = buildQuery({ ...target, page: meta.page + 1, perPage: 10 });
      const response = await fetch(`/api/v1/comments${query}`, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });

      const payload = (await response.json()) as {
        data?: CommentThreadView[];
        meta?: PageMeta;
      };

      if (!response.ok || !payload.data) throw new Error();

      setThreads((current) => [...current, ...payload.data!]);
      if (payload.meta) setMeta(payload.meta);
    } catch {
      toast.error('Nem sikerült betölteni a további hozzászólásokat.');
    } finally {
      setLoadingMore(false);
    }
  };

  /** Places a newly posted comment where it belongs, or reports the wait. */
  const accept = (comment: CommentView, parentId: string | null) => {
    setCount((value) => value + 1);

    if (parentId) {
      setThreads((current) =>
        current.map((thread) =>
          thread.id === parentId ? { ...thread, replies: [...thread.replies, comment] } : thread,
        ),
      );
      setReplyTo(null);
      return;
    }

    setThreads((current) => [{ ...comment, replies: [] }, ...current]);
  };

  /** Applies an edit in place, at whichever level the comment lives. */
  const patch = (id: string, changes: Partial<CommentView>) => {
    setThreads((current) =>
      current.map((thread) =>
        thread.id === id
          ? { ...thread, ...changes }
          : {
              ...thread,
              replies: thread.replies.map((reply) =>
                reply.id === id ? { ...reply, ...changes } : reply,
              ),
            },
      ),
    );
  };

  /**
   * Removes a comment the author just deleted.
   *
   * A top-level comment with replies becomes a tombstone rather than
   * disappearing — the server decides which, and this mirrors that rule so the
   * page does not have to be reloaded to find out.
   */
  const drop = (id: string) => {
    setCount((value) => Math.max(0, value - 1));

    setThreads((current) =>
      current.flatMap((thread) => {
        if (thread.id === id) {
          if (thread.replies.length === 0) return [];
          return [{ ...thread, deleted: true, body: '', user: null }];
        }

        return [{ ...thread, replies: thread.replies.filter((reply) => reply.id !== id) }];
      }),
    );
  };

  return (
    <section aria-labelledby="comments" className="mt-16 border-t border-ink-800 pt-10">
      <h2 id="comments" className="mb-6 flex items-center gap-2.5 text-xl">
        <MessageSquare className="size-5 text-mist-500" aria-hidden />
        Hozzászólások
        {count > 0 && <span className="nums text-base text-mist-500">{count}</span>}
      </h2>

      {viewer?.isVerified ? (
        <CommentForm
          target={target}
          parentId={null}
          viewer={viewer}
          requiresApproval={requiresApproval}
          onPosted={(comment) => accept(comment, null)}
        />
      ) : (
        <Gate viewer={viewer} returnTo={returnTo} />
      )}

      {threads.length === 0 ? (
        <p className="mt-8 text-sm text-mist-500">
          Még nincs hozzászólás. Legyél te az első.
        </p>
      ) : (
        <ul className="mt-8 space-y-6">
          {threads.map((thread) => (
            <li key={thread.id}>
              <CommentRow
                comment={thread}
                viewer={viewer}
                editMinutes={editMinutes}
                profilesPublic={profilesPublic}
                onEdited={(body, editedAt) => patch(thread.id, { body, editedAt })}
                onDeleted={() => drop(thread.id)}
              />

              {thread.replies.length > 0 && (
                <ul className="mt-4 space-y-4 border-l border-ink-800 pl-4 sm:ml-5 sm:pl-5">
                  {thread.replies.map((reply) => (
                    <li key={reply.id}>
                      <CommentRow
                        comment={reply}
                        compact
                        viewer={viewer}
                        editMinutes={editMinutes}
                        profilesPublic={profilesPublic}
                        onEdited={(body, editedAt) => patch(reply.id, { body, editedAt })}
                        onDeleted={() => drop(reply.id)}
                      />
                    </li>
                  ))}
                </ul>
              )}

              {viewer?.isVerified && (
                <div className="mt-3 sm:ml-13">
                  {replyTo === thread.id ? (
                    <CommentForm
                      target={target}
                      parentId={thread.id}
                      viewer={viewer}
                      requiresApproval={requiresApproval}
                      onPosted={(comment) => accept(comment, thread.id)}
                      onCancel={() => setReplyTo(null)}
                      autoFocus
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setReplyTo(thread.id)}
                      className="inline-flex items-center gap-1.5 text-2xs text-mist-500 transition-colors hover:text-bloom-300"
                    >
                      <Reply className="size-3.5" aria-hidden />
                      Válasz
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {meta.hasNext && (
        <div className="mt-8 text-center">
          <Button variant="outline" size="md" onClick={loadMore} loading={loadingMore}>
            Régebbi hozzászólások
          </Button>
        </div>
      )}
    </section>
  );
}

/** What a reader who cannot post yet sees instead of the box. */
function Gate({ viewer, returnTo }: { viewer: Viewer | null; returnTo: string }) {
  return (
    <p className="rounded-xl border border-ink-800 bg-ink-900/40 px-4 py-3.5 text-sm text-mist-400">
      {viewer ? (
        <>
          A hozzászóláshoz erősítsd meg az e-mail-címed. A megerősítő levelet a{' '}
          <Link href="/profil/beallitasok" className="text-bloom-300 underline-offset-4 hover:underline">
            fiókbeállításokban
          </Link>{' '}
          kérheted újra.
        </>
      ) : (
        <>
          <Link
            href={`/belepes?next=${encodeURIComponent(returnTo)}`}
            className="text-bloom-300 underline-offset-4 hover:underline"
          >
            Lépj be
          </Link>{' '}
          a hozzászóláshoz. Ha még nincs fiókod,{' '}
          <Link href="/regisztracio" className="text-bloom-300 underline-offset-4 hover:underline">
            regisztrálj
          </Link>{' '}
          — pár másodperc.
        </>
      )}
    </p>
  );
}

function CommentRow({
  comment,
  compact = false,
  viewer,
  editMinutes,
  profilesPublic,
  onEdited,
  onDeleted,
}: {
  comment: CommentView;
  compact?: boolean;
  viewer: Viewer | null;
  /**
   * The server's `commentEditMinutes`, passed down rather than mirrored as a
   * constant here.
   *
   * It only decides whether to *draw* the button — the server checks the window
   * again on the request, and it is the authority. A clock skewed the wrong way
   * therefore shows a button that answers with the server's own explanation,
   * which is a better failure than hiding a control that would have worked.
   * A hardcoded copy of the number, though, would go quietly wrong the first
   * time somebody changed the setting.
   */
  editMinutes: number;
  profilesPublic: boolean;
  onEdited: (body: string, editedAt: string) => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const toast = useToast();

  const mine = Boolean(viewer && comment.user && viewer.username === comment.user.username);
  const editable =
    mine &&
    !comment.deleted &&
    editMinutes > 0 &&
    Date.now() - new Date(comment.createdAt).getTime() < editMinutes * 60 * 1000;

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const result = await apiFetch<{ comment: { body: string; editedAt: string } }>(
        `/api/v1/comments/${comment.id}`,
        { method: 'PATCH', body: { body: draft } },
      );
      onEdited(result.comment.body, result.comment.editedAt);
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'A mentés nem sikerült.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);

    try {
      await apiFetch(`/api/v1/comments/${comment.id}`, { method: 'DELETE' });
      onDeleted();
    } catch (caught) {
      toast.error(
        'A törlés nem sikerült',
        caught instanceof ApiError ? caught.message : undefined,
      );
      setBusy(false);
    }
  };

  // A tombstone holds a thread open; it has no author, no body and no controls.
  if (comment.deleted) {
    return (
      <article className="flex gap-3">
        <div
          aria-hidden
          className={cn(
            'shrink-0 rounded-full border border-dashed border-ink-700',
            compact ? 'size-8' : 'size-10',
          )}
        />
        <p className="flex-1 self-center text-sm text-mist-600 italic">
          A szerző törölte ezt a hozzászólást.
        </p>
      </article>
    );
  }

  return (
    <article className="flex gap-3">
      <Avatar
        name={comment.user?.displayName ?? 'Törölt felhasználó'}
        src={comment.user?.avatarUrl ?? null}
        size={compact ? 'sm' : 'md'}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {/*
            A név mostantól visz valahová. A felhasználónevet eddig is lekértük,
            csak nem volt hova mutatnia — egy közösségi funkciónál pedig az a
            minimum, hogy meg lehessen nézni, ki írta.
          */}
          {comment.user && profilesPublic ? (
            <Link
              href={`/felhasznalo/${comment.user.username}`}
              className="text-sm font-medium text-mist-100 underline-offset-4 transition-colors hover:text-bloom-300 hover:underline"
            >
              {comment.user.displayName}
            </Link>
          ) : comment.user ? (
            /* Profiles are switched off site-wide: the name still identifies who
               wrote this — a thread is unreadable otherwise — it just has
               nowhere to lead. A link to a page that 404s would be worse than
               plain text. */
            <span className="text-sm font-medium text-mist-100">{comment.user.displayName}</span>
          ) : (
            /* Törölt fiók: nincs profil, amire mutasson. A szöveg marad, hogy a
               rá adott válaszok ne váljanak értelmezhetetlenné. */
            <span className="text-sm font-medium text-mist-500 italic">Törölt felhasználó</span>
          )}
          <time
            dateTime={new Date(comment.createdAt).toISOString()}
            className="text-2xs text-mist-600"
          >
            {formatRelative(comment.createdAt)}
          </time>
          {comment.editedAt && (
            /* Marked, not hidden: somebody may have replied to the old text. */
            <span className="text-2xs text-mist-600" title="A szerző módosította">
              · szerkesztve
            </span>
          )}
        </div>

        {editing ? (
          <div className="mt-2 space-y-2">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={3}
              aria-label="Hozzászólás szerkesztése"
            />
            {error && <p className="text-2xs text-danger-400">{error}</p>}
            <div className="flex gap-2">
              <Button size="xs" variant="primary" onClick={() => void save()} loading={busy}>
                Mentés
              </Button>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  setDraft(comment.body);
                  setError(null);
                  setEditing(false);
                }}
                disabled={busy}
              >
                Mégsem
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/*
              `whitespace-pre-wrap` and nothing else: the body is plain text, stored
              as the author typed it and rendered as text. No markdown, no HTML —
              the one field on this site that any registered account can write into
              is not the place to start interpreting markup.
            */}
            <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap text-mist-300">
              {comment.body}
            </p>

            {mine && (
              <div className="mt-1.5 flex items-center gap-3">
                {editable && (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="inline-flex items-center gap-1 text-2xs text-mist-600 transition-colors hover:text-bloom-300"
                  >
                    <Pencil className="size-3" aria-hidden />
                    Szerkesztés
                  </button>
                )}

                {confirming ? (
                  <span className="inline-flex items-center gap-2 text-2xs text-mist-500">
                    Biztosan törlöd?
                    <button
                      type="button"
                      onClick={() => void remove()}
                      disabled={busy}
                      className="font-medium text-danger-400 transition-colors hover:text-danger-500 disabled:opacity-60"
                    >
                      Igen
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(false)}
                      disabled={busy}
                      className="transition-colors hover:text-mist-300"
                    >
                      Mégsem
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    className="inline-flex items-center gap-1 text-2xs text-mist-600 transition-colors hover:text-danger-400"
                  >
                    <Trash2 className="size-3" aria-hidden />
                    Törlés
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </article>
  );
}

function CommentForm({
  target,
  parentId,
  viewer,
  requiresApproval,
  onPosted,
  onCancel,
  autoFocus = false,
}: {
  target: CommentTargetView;
  parentId: string | null;
  viewer: Viewer;
  requiresApproval: boolean;
  onPosted: (comment: CommentView) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const toast = useToast();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = body.trim();
  const tooShort = trimmed.length < 2;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (tooShort || busy) return;

    setBusy(true);
    setError(null);

    try {
      const result = await apiFetch<{ comment: CommentView; pendingApproval: boolean }>(
        '/api/v1/comments',
        { method: 'POST', body: { ...target, parentId, body: trimmed } },
      );

      setBody('');

      if (result.pendingApproval) {
        toast.info(
          'Elküldve, moderálásra vár',
          'Amint egy csapattag jóváhagyja, megjelenik az oldalon.',
        );
        onCancel?.();
        return;
      }

      onPosted(result.comment);
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : 'A hozzászólást most nem sikerült elküldeni.';
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className={cn('flex gap-3', parentId && 'mt-1')}>
      <Avatar
        name={viewer.displayName}
        src={viewer.avatarUrl}
        size={parentId ? 'sm' : 'md'}
        className="hidden sm:flex"
      />

      <div className="min-w-0 flex-1 space-y-2">
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={MAX_LENGTH}
          showCount
          autoFocus={autoFocus}
          invalid={Boolean(error)}
          placeholder={parentId ? 'Válasz…' : 'Szólj hozzá…'}
          className={parentId ? 'min-h-20' : undefined}
          aria-label={parentId ? 'Válasz szövege' : 'Hozzászólás szövege'}
        />

        {error && (
          <p role="alert" className="text-xs text-danger-400">
            {error}
          </p>
        )}

        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" loading={busy} disabled={tooShort}>
            {parentId ? 'Válasz küldése' : 'Küldés'}
          </Button>

          {onCancel && (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              Mégse
            </Button>
          )}

          {requiresApproval && (
            <span className="text-2xs text-mist-600">A hozzászólások moderálás után jelennek meg.</span>
          )}
        </div>
      </div>
    </form>
  );
}
