'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Laptop, LogOut, Smartphone } from 'lucide-react';
import { formatRelative } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { apiFetch } from '@/lib/client/api';

export interface SessionRow {
  id: string;
  userAgent: string | null;
  lastUsedAt: string;
  createdAt: string;
}

/**
 * Active sessions.
 *
 * Showing people where their account is signed in — and giving them a one-click
 * way to end all of it — is the single most useful account-security control a
 * site can offer. The device label is derived from the user agent rather than
 * shown raw: "Chrome / macOS" is actionable, a 180-character UA string is not.
 */
export function SessionList({ sessions }: { sessions: SessionRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [, startTransition] = useTransition();

  const revokeAll = async () => {
    try {
      // Changing the password is the flow that revokes other sessions; here we
      // simply end this one, which is the honest thing a logout button does.
      await apiFetch('/api/v1/auth/logout', { method: 'POST' });
      window.location.assign('/belepes');
    } catch {
      toast.error('Nem sikerült kijelentkezni');
      startTransition(() => router.refresh());
    }
  };

  return (
    <>
      <Card>
        <CardHeader
          title="Aktív munkamenetek"
          description="Ahol jelenleg be vagy jelentkezve."
          action={
            <Button
              variant="danger"
              size="sm"
              leadingIcon={<LogOut className="size-4" aria-hidden />}
              onClick={() => setConfirmOpen(true)}
            >
              Kijelentkezés
            </Button>
          }
        />

        <CardBody>
          <ul className="space-y-2">
            {sessions.map((session, index) => {
              const label = describeUserAgent(session.userAgent);
              const Icon = label.mobile ? Smartphone : Laptop;

              return (
                <li
                  key={session.id}
                  className="flex items-center gap-3 rounded-lg border border-ink-800 bg-ink-900/40 px-3.5 py-3"
                >
                  <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-lg bg-ink-850 text-mist-400">
                    <Icon className="size-4" />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-mist-200">
                      {label.text}
                      {index === 0 && (
                        <span className="ml-2 rounded-full bg-success-500/15 px-2 py-0.5 text-2xs font-medium text-success-400">
                          jelenlegi
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-2xs text-mist-600">
                      Utoljára használva: {formatRelative(session.lastUsedAt)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>

          <p className="mt-4 text-2xs leading-relaxed text-mist-600">
            Ha idegen eszközt látsz a listában, változtass jelszót — az minden más
            munkamenetet azonnal érvénytelenít.
          </p>
        </CardBody>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={revokeAll}
        title="Kijelentkezés"
        description="Kijelentkeztetünk ezen az eszközön. A többi eszközöd bejelentkezve marad."
        confirmLabel="Kijelentkezem"
        tone="danger"
      />
    </>
  );
}

/** Coarse, privacy-respecting device label. Deliberately not fingerprinting. */
function describeUserAgent(userAgent: string | null): { text: string; mobile: boolean } {
  if (!userAgent) return { text: 'Ismeretlen eszköz', mobile: false };

  const mobile = /Mobile|Android|iPhone|iPad/i.test(userAgent);

  const browser =
    /Edg\//.test(userAgent) ? 'Edge'
    : /OPR\/|Opera/.test(userAgent) ? 'Opera'
    : /Firefox\//.test(userAgent) ? 'Firefox'
    : /Chrome\//.test(userAgent) ? 'Chrome'
    : /Safari\//.test(userAgent) ? 'Safari'
    : 'Böngésző';

  const platform =
    /Windows/.test(userAgent) ? 'Windows'
    : /Macintosh|Mac OS/.test(userAgent) ? 'macOS'
    : /Android/.test(userAgent) ? 'Android'
    : /iPhone|iPad|iOS/.test(userAgent) ? 'iOS'
    : /Linux/.test(userAgent) ? 'Linux'
    : 'ismeretlen rendszer';

  return { text: `${browser} · ${platform}`, mobile };
}
