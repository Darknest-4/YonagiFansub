'use client';

import { useState } from 'react';
import { MailWarning, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { ApiError, apiFetch } from '@/lib/client/api';

/**
 * The way out of an unconfirmed account.
 *
 * Registration sent the confirmation link once and offered no second attempt.
 * A message that went to spam, to a mistyped address, or — the case that
 * actually happened here — was never sent because mail was misconfigured, left
 * the account permanently half-registered: able to log in, unable to comment,
 * with nothing on the site saying why or what to do.
 *
 * So the card states both halves: what is currently not working, and the button
 * that fixes it. It renders only for accounts that need it, which is what keeps
 * it from becoming another permanent banner people learn to ignore.
 */
export function VerifyEmailCard({ email }: { email: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const resend = async () => {
    setBusy(true);
    try {
      await apiFetch('/api/v1/auth/verify/resend', {
        method: 'POST',
        body: { email, website: '' },
      });
      setSent(true);
      toast.success('Elküldtük', 'Nézd meg a postaládád — és a spam mappát is.');
    } catch (error) {
      toast.error(
        'Nem sikerült elküldeni',
        error instanceof ApiError ? error.message : 'Próbáld újra pár perc múlva.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Erősítsd meg az e-mail-címed"
        description="Amíg ez nincs meg, nem tudsz hozzászólni."
      />
      <CardBody>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span
            aria-hidden
            className="grid size-10 shrink-0 place-items-center rounded-full bg-warning-400/10 text-warning-400"
          >
            <MailWarning className="size-5" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-sm text-mist-200">
              A megerősítő linket ide küldtük: <strong className="break-all">{email}</strong>
            </p>
            <p className="mt-1 text-2xs leading-relaxed text-mist-500">
              Ha nem érkezett meg, nézd meg a spam mappát. Az újraküldés minden korábbi
              linket érvénytelenít, tehát mindig a legfrissebb levélben lévő működik.
            </p>
          </div>

          <Button
            onClick={resend}
            loading={busy}
            variant="secondary"
            size="md"
            className="shrink-0"
            leadingIcon={<Send className="size-4" aria-hidden />}
          >
            {sent ? 'Küldés újra' : 'Küldd el újra'}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
