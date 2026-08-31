'use client';

import Link from 'next/link';
import { useState } from 'react';
import { MessageSquare, Reply } from 'lucide-react';
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
  parentId: string | null;
  user: CommentAuthorView;
}

export interface CommentThreadView extends CommentView {
  replies: CommentView[];
}

export type CommentTargetView =
  | { projectId: string }
  | { episodeId: string }
  | { newsPostId: string };

interface Viewer {
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
  returnTo,
}: {
  target: CommentTargetView;
  initialThreads: CommentThreadView[];
  initialMeta: PageMeta;
  total: number;
  viewer: Viewer | null;
  requiresApproval: boolean;
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
              <CommentRow comment={thread} />

              {thread.replies.length > 0 && (
                <ul className="mt-4 space-y-4 border-l border-ink-800 pl-4 sm:ml-5 sm:pl-5">
                  {thread.replies.map((reply) => (
                    <li key={reply.id}>
                      <CommentRow comment={reply} compact />
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

function CommentRow({ comment, compact = false }: { comment: CommentView; compact?: boolean }) {
  return (
    <article className="flex gap-3">
      <Avatar
        name={comment.user.displayName}
        src={comment.user.avatarUrl}
        size={compact ? 'sm' : 'md'}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {/*
            A név mostantól visz valahová. A felhasználónevet eddig is lekértük,
            csak nem volt hova mutatnia — egy közösségi funkciónál pedig az a
            minimum, hogy meg lehessen nézni, ki írta.
          */}
          <Link
            href={`/felhasznalo/${comment.user.username}`}
            className="text-sm font-medium text-mist-100 underline-offset-4 transition-colors hover:text-bloom-300 hover:underline"
          >
            {comment.user.displayName}
          </Link>
          <time
            dateTime={new Date(comment.createdAt).toISOString()}
            className="text-2xs text-mist-600"
          >
            {formatRelative(comment.createdAt)}
          </time>
        </div>
        {/*
          `whitespace-pre-wrap` and nothing else: the body is plain text, stored
          as the author typed it and rendered as text. No markdown, no HTML —
          the one field on this site that any registered account can write into
          is not the place to start interpreting markup.
        */}
        <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap text-mist-300">
          {comment.body}
        </p>
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
