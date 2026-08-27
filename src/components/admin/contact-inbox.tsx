'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import type { ContactCategory, ContactStatus } from '@prisma/client';
import { Mail, Save } from 'lucide-react';
import { cn, formatDateTime, formatRelative } from '@/lib/utils';
import { Badge, CONTACT_STATUS } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Select, Textarea } from '@/components/ui/field';
import { Pagination } from '@/components/ui/pagination';
import { useToast } from '@/components/ui/toast';
import { ApiError, apiFetch } from '@/lib/client/api';

export interface ContactMessageView {
  id: string;
  name: string;
  email: string;
  subject: string;
  body: string;
  category: ContactCategory;
  status: ContactStatus;
  internalNote: string | null;
  createdAt: string;
  handledAt: string | null;
  handledBy: string | null;
}

const CATEGORY_LABEL: Record<ContactCategory, string> = {
  GENERAL: 'Általános',
  PROJECT_REQUEST: 'Projektjavaslat',
  BUG_REPORT: 'Hibabejelentés',
  JOIN_TEAM: 'Jelentkezés',
  TAKEDOWN: 'Jogi megkeresés',
  BUSINESS: 'Együttműködés',
};

/**
 * Contact inbox.
 *
 * A master/detail list rather than a table: these are messages, and a message
 * is read in full or not at all. Selecting one expands it inline, which keeps
 * the queue visible — the thing an inbox is for.
 *
 * Legal enquiries are visually flagged. They carry a deadline the others do not,
 * and burying one in a list of project suggestions is how a takedown request
 * gets missed.
 */
export function ContactInbox({
  messages,
  meta,
  canWrite,
}: {
  messages: ContactMessageView[];
  meta: { page?: number; totalPages?: number; total?: number; perPage?: number };
  canWrite: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(messages[0]?.id ?? null);

  const status = searchParams.get('status') ?? '';

  const setStatusFilter = (value: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set('status', value);
    else next.delete('status');
    next.delete('page');
    router.push(`/admin/uzenetek${next.toString() ? `?${next}` : ''}`, { scroll: false });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        <FilterPill active={!status} onClick={() => setStatusFilter('')}>
          Mind
        </FilterPill>
        {Object.entries(CONTACT_STATUS).map(([value, config]) => (
          <FilterPill
            key={value}
            active={status === value}
            onClick={() => setStatusFilter(value)}
          >
            {config.label}
          </FilterPill>
        ))}
      </div>

      <ul className="space-y-2">
        {messages.map((message) => (
          <li key={message.id}>
            <MessageCard
              message={message}
              open={openId === message.id}
              onToggle={() => setOpenId(openId === message.id ? null : message.id)}
              canWrite={canWrite}
            />
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
          return `/admin/uzenetek${next.toString() ? `?${next}` : ''}`;
        }}
      />
    </div>
  );
}

function MessageCard({
  message,
  open,
  onToggle,
  canWrite,
}: {
  message: ContactMessageView;
  open: boolean;
  onToggle: () => void;
  canWrite: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [status, setStatus] = useState(message.status);
  const [note, setNote] = useState(message.internalNote ?? '');
  const [pending, setPending] = useState(false);

  const isLegal = message.category === 'TAKEDOWN';
  const unread = message.status === 'NEW';
  const dirty = status !== message.status || note !== (message.internalNote ?? '');

  const save = async () => {
    setPending(true);
    try {
      await apiFetch(`/api/v1/admin/contact/${message.id}`, {
        method: 'PATCH',
        body: { status, internalNote: note },
      });
      toast.success('Üzenet frissítve');
      router.refresh();
    } catch (error) {
      toast.error(
        'Mentés sikertelen',
        error instanceof ApiError ? error.message : 'Próbáld újra.',
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <article
      className={cn(
        'overflow-hidden rounded-xl border transition-colors duration-fast',
        isLegal
          ? 'border-danger-500/30 bg-danger-900/10'
          : unread
            ? 'border-tide-400/25 bg-tide-400/[0.04]'
            : 'border-ink-800 bg-ink-900/40',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-ink-850/60"
      >
        <Mail
          className={cn('size-4 shrink-0', unread ? 'text-tide-300' : 'text-mist-600')}
          aria-hidden
        />

        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block truncate text-sm',
              unread ? 'font-semibold text-mist-50' : 'text-mist-200',
            )}
          >
            {message.subject}
          </span>
          <span className="block truncate text-2xs text-mist-500">
            {message.name} · {message.email}
          </span>
        </span>

        <Badge tone={isLegal ? 'danger' : 'neutral'} className="shrink-0">
          {CATEGORY_LABEL[message.category]}
        </Badge>

        <Badge tone={CONTACT_STATUS[message.status].tone} className="shrink-0">
          {CONTACT_STATUS[message.status].label}
        </Badge>

        <span className="shrink-0 text-2xs text-mist-600">
          {formatRelative(message.createdAt)}
        </span>
      </button>

      {open && (
        <div className="border-t border-ink-800 px-4 py-4">
          <p className="text-2xs text-mist-600">
            Beérkezett: {formatDateTime(message.createdAt)}
            {message.handledBy && ` · Kezelte: ${message.handledBy}`}
          </p>

          <div className="mt-3 rounded-lg border border-ink-800 bg-ink-950/50 p-4">
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-mist-200">
              {message.body}
            </p>
          </div>

          <a
            href={`mailto:${message.email}?subject=${encodeURIComponent(`Re: ${message.subject}`)}`}
            className="mt-3 inline-block text-xs font-medium text-tide-300 underline-offset-4 hover:underline"
          >
            Válasz e-mailben →
          </a>

          {canWrite && (
            <div className="mt-5 space-y-3 border-t border-ink-800 pt-4">
              <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
                <Field label="Státusz">
                  {({ id }) => (
                    <Select
                      id={id}
                      selectSize="sm"
                      value={status}
                      onChange={(event) => setStatus(event.target.value as ContactStatus)}
                    >
                      {Object.entries(CONTACT_STATUS).map(([value, config]) => (
                        <option key={value} value={value}>
                          {config.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>

                <Field label="Belső jegyzet" optionalLabel>
                  {({ id }) => (
                    <Textarea
                      id={id}
                      rows={2}
                      maxLength={4000}
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="Csak a csapat látja."
                    />
                  )}
                </Field>
              </div>

              <Button
                variant="secondary"
                size="sm"
                onClick={save}
                loading={pending}
                disabled={!dirty}
                leadingIcon={<Save className="size-3.5" aria-hidden />}
              >
                Mentés
              </Button>
            </div>
          )}
        </div>
      )}
    </article>
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
