'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Bell, BellOff, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { ApiError, apiFetch } from '@/lib/client/api';

/**
 * Follow / unfollow a project.
 *
 * Optimistic: the button flips immediately and rolls back if the request fails,
 * because the round trip is long enough to feel broken otherwise. An
 * unauthenticated click routes to login with a `next` param rather than showing
 * an error — the user asked for something reasonable, so the job is to get them
 * there, not to scold them.
 */
export function FollowButton({
  projectId,
  projectSlug,
  initialFollowing,
  isAuthenticated,
  followerCount,
}: {
  projectId: string;
  projectSlug: string;
  initialFollowing: boolean;
  isAuthenticated: boolean;
  followerCount: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [following, setFollowing] = useState(initialFollowing);
  const [count, setCount] = useState(followerCount);
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    if (!isAuthenticated) {
      router.push(`/belepes?next=${encodeURIComponent(`/projektek/${projectSlug}`)}`);
      return;
    }

    const next = !following;
    setFollowing(next);
    setCount((value) => Math.max(0, value + (next ? 1 : -1)));
    setBusy(true);

    try {
      if (next) {
        await apiFetch(`/api/v1/favorites/${projectId}`, {
          method: 'PUT',
          body: { notify: true },
        });
        toast.success('Követed a projektet', 'Szólunk, amint új kiadás érkezik.');
      } else {
        await apiFetch(`/api/v1/favorites/${projectId}`, { method: 'DELETE' });
        toast.info('Követés visszavonva');
      }

      startTransition(() => router.refresh());
    } catch (error) {
      // Roll back the optimistic update.
      setFollowing(!next);
      setCount((value) => Math.max(0, value + (next ? -1 : 1)));

      const message =
        error instanceof ApiError ? error.message : 'A művelet most nem sikerült.';
      toast.error('Nem sikerült menteni', message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant={following ? 'outline' : 'secondary'}
      size="md"
      onClick={toggle}
      loading={busy || pending}
      aria-pressed={following}
      leadingIcon={
        following ? (
          <Bell className="size-4 fill-current" aria-hidden />
        ) : (
          <Star className="size-4" aria-hidden />
        )
      }
    >
      {following ? 'Követed' : 'Követem'}
      {count > 0 && <span className="nums ml-1 text-mist-500">{count}</span>}
    </Button>
  );
}

/** Compact icon-only variant for dense lists. */
export function FollowToggleIcon({
  projectId,
  initialFollowing,
}: {
  projectId: string;
  initialFollowing: boolean;
}) {
  const toast = useToast();
  const [following, setFollowing] = useState(initialFollowing);

  return (
    <button
      type="button"
      aria-label={following ? 'Követés visszavonása' : 'Projekt követése'}
      aria-pressed={following}
      onClick={async () => {
        const next = !following;
        setFollowing(next);
        try {
          await apiFetch(`/api/v1/favorites/${projectId}`, {
            method: next ? 'PUT' : 'DELETE',
            ...(next ? { body: { notify: true } } : {}),
          });
        } catch {
          setFollowing(!next);
          toast.error('Nem sikerült menteni');
        }
      }}
      className="rounded-lg p-2 text-mist-400 transition-colors hover:bg-ink-800 hover:text-tide-300"
    >
      {following ? (
        <Bell className="size-4 fill-current text-tide-300" aria-hidden />
      ) : (
        <BellOff className="size-4" aria-hidden />
      )}
    </button>
  );
}
