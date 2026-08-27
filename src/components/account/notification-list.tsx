'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Bell, CheckCheck, MessageSquare, Newspaper, Package, Shield } from 'lucide-react';
import { cn, formatRelative } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/client/api';

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  imageUrl: string | null;
  readAt: string | null;
  createdAt: string;
}

const TYPE_CONFIG: Record<string, { icon: typeof Bell; tone: string }> = {
  NEW_RELEASE: { icon: Package, tone: 'text-tide-300' },
  PROJECT_UPDATE: { icon: Package, tone: 'text-orchid-300' },
  NEWS_POST: { icon: Newspaper, tone: 'text-ember-300' },
  COMMENT_REPLY: { icon: MessageSquare, tone: 'text-sakura-300' },
  MODERATION: { icon: Shield, tone: 'text-warning-400' },
  SYSTEM: { icon: Bell, tone: 'text-mist-400' },
};

/**
 * Notification list.
 *
 * Opening a notification marks it read optimistically and then navigates — the
 * user should never watch a spinner to read something they already tapped. If
 * the write fails the row reverts, which is a far better outcome than blocking
 * the navigation on a bookkeeping call.
 */
export function NotificationList({ initialItems }: { initialItems: NotificationItem[] }) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState(initialItems);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  const unreadCount = items.filter((item) => !item.readAt).length;

  const markRead = async (ids?: string[]) => {
    const now = new Date().toISOString();
    const previous = items;

    setItems((current) =>
      current.map((item) =>
        (!ids || ids.includes(item.id)) && !item.readAt ? { ...item, readAt: now } : item,
      ),
    );

    try {
      await apiFetch('/api/v1/notifications', { method: 'PATCH', body: { ids } });
      startTransition(() => router.refresh());
    } catch {
      setItems(previous);
      toast.error('Nem sikerült frissíteni', 'Próbáld újra néhány másodperc múlva.');
    }
  };

  return (
    <section aria-labelledby="notifications">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 id="notifications" className="text-lg font-semibold text-mist-100">
          Értesítések
          {unreadCount > 0 && (
            <span className="nums ml-2 rounded-full bg-ember-400 px-2 py-0.5 text-2xs font-bold text-ink-950">
              {unreadCount}
            </span>
          )}
        </h2>

        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            loading={busy || pending}
            leadingIcon={<CheckCheck className="size-4" aria-hidden />}
            onClick={async () => {
              setBusy(true);
              await markRead();
              setBusy(false);
            }}
          >
            Összes olvasottnak jelölése
          </Button>
        )}
      </div>

      <ul className="space-y-2">
        {items.map((item) => {
          const config = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.SYSTEM!;
          const Icon = config.icon;
          const unread = !item.readAt;

          const body = (
            <>
              <span
                aria-hidden
                className={cn(
                  'grid size-9 shrink-0 place-items-center rounded-lg bg-ink-850',
                  config.tone,
                )}
              >
                <Icon className="size-4" />
              </span>

              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    'block text-sm',
                    unread ? 'font-semibold text-mist-50' : 'text-mist-300',
                  )}
                >
                  {item.title}
                </span>
                {item.body && (
                  <span className="mt-0.5 block truncate text-xs text-mist-500">{item.body}</span>
                )}
                <span className="mt-1 block text-2xs text-mist-600">
                  {formatRelative(item.createdAt)}
                </span>
              </span>

              {unread && (
                <span
                  aria-label="Olvasatlan"
                  className="mt-1.5 size-2 shrink-0 rounded-full bg-tide-400"
                />
              )}
            </>
          );

          const shell = cn(
            'flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-colors duration-fast',
            unread
              ? 'border-tide-400/20 bg-tide-400/[0.04] hover:border-tide-400/40'
              : 'border-ink-800 bg-ink-900/40 hover:border-ink-600',
          );

          return (
            <li key={item.id}>
              {item.href ? (
                <Link href={item.href} className={shell} onClick={() => unread && void markRead([item.id])}>
                  {body}
                </Link>
              ) : (
                <button
                  type="button"
                  className={shell}
                  onClick={() => unread && void markRead([item.id])}
                >
                  {body}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
