'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import type { CommentStatus } from '@prisma/client';
import { Check, EyeOff, Trash2 } from 'lucide-react';
import { cn, formatRelative } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/field';
import { Checkbox } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { Pagination } from '@/components/ui/pagination';
import { useToast } from '@/components/ui/toast';
import { ApiError, apiFetch } from '@/lib/client/api';

export interface CommentView {
  id: string;
  body: string;
  status: CommentStatus;
  createdAt: string;
  authorName: string;
  authorUsername: string;
  authorAvatar: string | null;
  target: { label: string; href: string } | null;
}

const STATUS_CONFIG: Record<CommentStatus, { label: string; tone: BadgeTone }> = {
  PUBLISHED: { label: 'Látható', tone: 'success' },
  PENDING: { label: 'Jóváhagyásra vár', tone: 'warning' },
  HIDDEN: { label: 'Elrejtve', tone: 'warm' },
  DELETED: { label: 'Törölve', tone: 'danger' },
};

/**
 * Comment moderation queue.
 *
 * Approve and hide are one click, because those are the two actions that make up
 * 95% of moderation work. Deleting — the only irreversible-feeling one — opens a
 * dialog that offers to tell the author why, since a silent removal is what turns
 * a moderation decision into a grievance.
 */
export function CommentModeration({
  comments,
  meta,
}: {
  comments: CommentView[];
  meta: { page?: number; totalPages?: number; total?: number; perPage?: number };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<CommentView | null>(null);
  const [note, setNote] = useState('');
  const [notifyAuthor, setNotifyAuthor] = useState(true);

  const status = searchParams.get('status') ?? '';

  const setStatusFilter = (value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set('status', value);
    else next.delete('status');
    next.delete('page');
    router.push(`/admin/hozzaszolasok${next.toString() ? `?${next}` : ''}`, { scroll: false });
  };

  const moderate = async (
    comment: CommentView,
    nextStatus: CommentStatus,
    options: { moderationNote?: string; notifyAuthor?: boolean } = {},
  ) => {
    setBusyId(comment.id);
    try {
      await apiFetch(`/api/v1/admin/comments/${comment.id}`, {
        method: 'PATCH',
        body: {
          status: nextStatus,
          moderationNote: options.moderationNote,
          notifyAuthor: options.notifyAuthor ?? false,
        },
      });
      toast.success('Hozzászólás frissítve');
      router.refresh();
    } catch (error) {
      toast.error(
        'A művelet nem sikerült',
        error instanceof ApiError ? error.message : 'Próbáld újra.',
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        <FilterPill active={!status} onClick={() => setStatusFilter('')}>
          Mind
        </FilterPill>
        {Object.entries(STATUS_CONFIG)
          .filter(([value]) => value !== 'DELETED')
          .map(([value, config]) => (
            <FilterPill
              key={value}
              active={status === value}
              onClick={() => setStatusFilter(value)}
            >
              {config.label}
            </FilterPill>
          ))}
      </div>

      <ul className="space-y-2.5">
        {comments.map((comment) => (
          <li
            key={comment.id}
            className={cn(
              'rounded-xl border p-4',
              comment.status === 'PENDING'
                ? 'border-warning-500/25 bg-warning-900/10'
                : 'border-ink-800 bg-ink-900/40',
            )}
          >
            <div className="flex items-start gap-3">
              <Avatar name={comment.authorName} src={comment.authorAvatar} size="sm" />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-mist-100">
                    {comment.authorName}
                  </span>
                  <span className="font-mono text-2xs text-mist-600">
                    @{comment.authorUsername}
                  </span>
                  <Badge tone={STATUS_CONFIG[comment.status].tone} size="sm">
                    {STATUS_CONFIG[comment.status].label}
                  </Badge>
                  <span className="text-2xs text-mist-600">
                    {formatRelative(comment.createdAt)}
                  </span>
                </div>

                {comment.target && (
                  <Link
                    href={comment.target.href}
                    target="_blank"
                    className="mt-0.5 block truncate text-2xs text-tide-300 underline-offset-4 hover:underline"
                  >
                    {comment.target.label}
                  </Link>
                )}

                <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-mist-200">
                  {comment.body}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {comment.status !== 'PUBLISHED' && (
                    <Button
                      variant="secondary"
                      size="xs"
                      loading={busyId === comment.id}
                      onClick={() => moderate(comment, 'PUBLISHED')}
                      leadingIcon={<Check className="size-3.5" aria-hidden />}
                    >
                      Jóváhagyás
                    </Button>
                  )}

                  {comment.status !== 'HIDDEN' && (
                    <Button
                      variant="subtle"
                      size="xs"
                      loading={busyId === comment.id}
                      onClick={() => moderate(comment, 'HIDDEN')}
                      leadingIcon={<EyeOff className="size-3.5" aria-hidden />}
                    >
                      Elrejtés
                    </Button>
                  )}

                  <Button
                    variant="danger"
                    size="xs"
                    onClick={() => {
                      setNote('');
                      setNotifyAuthor(true);
                      setDeleting(comment);
                    }}
                    leadingIcon={<Trash2 className="size-3.5" aria-hidden />}
                  >
                    Törlés
                  </Button>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <Pagination
        page={meta.page ?? 1}
        totalPages={meta.totalPages ?? 1}
        total={meta.total}
        perPage={meta.perPage}
        buildHref={(page) => {
          const next = new URLSearchParams(searchParams.toString());
          if (page > 1) next.set('page', String(page));
          else next.delete('page');
          return `/admin/hozzaszolasok${next.toString() ? `?${next}` : ''}`;
        }}
      />

      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Hozzászólás törlése"
        description="A hozzászólás eltűnik az oldalról. Az indoklás a naplóba kerül, és — ha kéred — a szerzőnek is elmegy."
        size="sm"
        dismissible={busyId === null}
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleting(null)}
              disabled={busyId !== null}
            >
              Mégse
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={busyId !== null}
              onClick={async () => {
                if (!deleting) return;
                await moderate(deleting, 'DELETED', {
                  moderationNote: note,
                  notifyAuthor,
                });
                setDeleting(null);
              }}
            >
              Törlés
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <blockquote className="rounded-lg border border-ink-800 bg-ink-950/50 p-3 text-xs leading-relaxed text-mist-400">
            {deleting?.body}
          </blockquote>

          <Field label="Indoklás" optionalLabel>
            {({ id }) => (
              <Textarea
                id={id}
                rows={2}
                maxLength={500}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="pl. személyeskedés"
              />
            )}
          </Field>

          <Checkbox
            checked={notifyAuthor}
            onChange={(event) => setNotifyAuthor(event.target.checked)}
            label="Értesítsük a szerzőt"
            description="Kap egy értesítést az indoklással együtt."
          />
        </div>
      </Modal>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-3 py-1.5 text-2xs font-medium transition-colors duration-fast',
        active
          ? 'border-tide-400/40 bg-tide-400/12 text-tide-200'
          : 'border-ink-700 bg-ink-900 text-mist-400 hover:border-ink-600 hover:text-mist-200',
      )}
    >
      {children}
    </button>
  );
}
