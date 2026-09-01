'use client';

import { useState } from 'react';
import { AlertTriangle, Download, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { ApiError, apiFetch } from '@/lib/client/api';

/**
 * The two things the privacy policy promises and nothing implemented: a copy of
 * everything, and erasure.
 *
 * Both live in one card, at the bottom of the settings page, because that is
 * where people look for them and because they belong together — the sensible
 * order is "download my data, then delete my account", and putting the export
 * button directly above the delete button makes that order obvious without a
 * sentence telling anyone to do it.
 */
export function DataRightsCard({ username }: { username: string }) {
  const toast = useToast();

  const [exporting, setExporting] = useState(false);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Downloads the export.
   *
   * `fetch` plus a blob rather than a plain link, because the endpoint needs the
   * session cookie *and* returns `Cache-Control: no-store`: a navigation would
   * work but would leave the whole account sitting in the browser's history
   * entry for the tab.
   */
  const download = async () => {
    if (exporting) return;
    setExporting(true);

    try {
      const response = await fetch('/api/v1/me/export', {
        headers: { accept: 'application/json' },
        credentials: 'same-origin',
      });

      if (!response.ok) throw new Error(String(response.status));

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `yonagi-adatexport-${new Date().toISOString().slice(0, 10)}.json`;

      // In the document, and revoked a tick later. A detached anchor's
      // programmatic click is ignored by Chromium, and revoking the object URL
      // in the same turn cancels the download that click just started — both
      // silently, which is how this shipped broken the first time.
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);

      toast.success('Az adataid letöltése elindult');
    } catch {
      toast.error('A letöltés nem sikerült', 'Próbáld újra néhány perc múlva.');
    } finally {
      setExporting(false);
    }
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      await apiFetch('/api/v1/me', { method: 'DELETE', body: { password } });
      // Not `router.push`: every cached server payload in this tab belongs to an
      // account that no longer exists.
      window.location.href = '/';
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'A törlés nem sikerült.');
      setBusy(false);
    }
  };

  // Typing the username is the deliberate friction. A password field alone is
  // something people fill in on reflex; this one cannot be answered without
  // reading what it asks.
  const canDelete = password.length > 0 && confirmation === username;

  return (
    <>
      <Card>
        <CardHeader
          title="Az adataid"
          description="Bármikor kikérheted a rólad tárolt adatokat, és bármikor törölheted a fiókod."
        />

        <CardBody className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-mist-100">Adatexport</p>
              <p className="mt-0.5 text-2xs text-mist-500">
                Minden, amit rólad tárolunk, egyetlen JSON fájlban.
              </p>
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => void download()}
              loading={exporting}
              leadingIcon={<Download className="size-4" aria-hidden />}
            >
              Letöltés
            </Button>
          </div>

          <div className="border-t border-ink-800 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-danger-400">Fiók törlése</p>
                <p className="mt-0.5 text-2xs text-mist-500">
                  Végleges. Előtte érdemes letöltened az adataidat.
                </p>
              </div>

              <Button
                variant="danger"
                size="sm"
                onClick={() => setOpen(true)}
                leadingIcon={<Trash2 className="size-4" aria-hidden />}
              >
                Törlés
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      <Modal open={open} onClose={() => !busy && setOpen(false)} title="Fiók végleges törlése">
        <div className="space-y-4">
          <div className="flex gap-3 rounded-lg border border-danger-500/30 bg-danger-500/8 p-3">
            <AlertTriangle className="size-4 shrink-0 text-danger-400" aria-hidden />
            <div className="space-y-2 text-2xs leading-relaxed text-mist-300">
              <p>
                Törlődik a profilod, az értékeléseid, a kedvenceid, a nézési előrehaladásod és
                az értesítéseid. Ez nem vonható vissza.
              </p>
              {/*
                Said plainly, because it is the one part that surprises people.
                Deleting the comments would delete the replies other people wrote
                underneath them — so the text stays and the name comes off.
              */}
              <p>
                A hozzászólásaid <strong className="text-mist-100">szövege megmarad</strong>, de
                elválik a nevedtől: „Törölt felhasználó” lesz a szerzőjük. Ha törölnénk őket,
                velük tűnnének el a rájuk adott válaszok is, amiket mások írtak.
              </p>
            </div>
          </div>

          <Field label="A jelszavad" required>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
              />
            )}
          </Field>

          <Field
            label={`Írd be a felhasználóneved a megerősítéshez: ${username}`}
            required
            error={error ?? undefined}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                value={confirmation}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            )}
          </Field>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Mégsem
            </Button>
            <Button
              variant="danger"
              onClick={() => void remove()}
              loading={busy}
              disabled={!canDelete}
            >
              Végleges törlés
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
