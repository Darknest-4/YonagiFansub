'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { KeyRound, Save, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/field';
import { InlineError } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';
import { ApiError, apiFetch, type FieldErrors } from '@/lib/client/api';

export interface ProfileValues {
  displayName: string;
  bio: string;
  avatarUrl: string;
}

export interface PreferenceValues {
  notifyNewRelease: boolean;
  notifyNewsPost: boolean;
  notifyCommentReply: boolean;
  emailDigest: 'off' | 'daily' | 'weekly';
  reducedMotion: boolean;
}

/**
 * Settings forms.
 *
 * Three separate forms rather than one big save button. Each has a different
 * risk profile — a bio typo is trivial, a password change logs out every other
 * device — and bundling them would mean the same confirmation weight for both.
 */
export function ProfileForm({ initial }: { initial: ProfileValues }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [bio, setBio] = useState(initial.bio);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setFieldErrors({});
    setFormError(null);

    const data = new FormData(event.currentTarget);

    try {
      await apiFetch('/api/v1/me/profile', {
        method: 'PATCH',
        body: {
          displayName: String(data.get('displayName') ?? ''),
          bio: String(data.get('bio') ?? ''),
          avatarUrl: String(data.get('avatarUrl') ?? ''),
        },
      });

      toast.success('Profil mentve');
      startTransition(() => router.refresh());
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

  return (
    <Card>
      <CardHeader title="Profil" description="Ezt látják mások az oldalon." />
      <CardBody>
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {formError && <InlineError message={formError} />}

          <Field label="Megjelenített név" required error={fieldErrors.displayName}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                name="displayName"
                defaultValue={initial.displayName}
                required
                maxLength={48}
                invalid={invalid}
                aria-describedby={describedBy}
              />
            )}
          </Field>

          <Field
            label="Profilkép URL"
            optionalLabel
            hint="Közvetlen link egy képre. Üresen hagyva generált avatart kapsz."
            error={fieldErrors.avatarUrl}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                name="avatarUrl"
                type="url"
                defaultValue={initial.avatarUrl}
                invalid={invalid}
                aria-describedby={describedBy}
                placeholder="https://…"
              />
            )}
          </Field>

          <Field label="Bemutatkozás" optionalLabel error={fieldErrors.bio}>
            {({ id, describedBy, invalid }) => (
              <Textarea
                id={id}
                name="bio"
                rows={4}
                maxLength={500}
                showCount
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                invalid={invalid}
                aria-describedby={describedBy}
              />
            )}
          </Field>

          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={pending}
            leadingIcon={<Save className="size-4" aria-hidden />}
          >
            Mentés
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

export function PreferencesForm({ initial }: { initial: PreferenceValues }) {
  const toast = useToast();
  const [values, setValues] = useState(initial);
  const [pending, setPending] = useState(false);

  const save = async (next: PreferenceValues) => {
    const previous = values;
    setValues(next);
    setPending(true);

    try {
      await apiFetch('/api/v1/me/preferences', { method: 'PATCH', body: next });
    } catch {
      setValues(previous);
      toast.error('Nem sikerült menteni a beállítást');
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Értesítések"
        description="Bármikor módosíthatod. A változás azonnal érvénybe lép."
      />
      <CardBody className="space-y-5">
        <Switch
          checked={values.notifyNewRelease}
          onChange={(checked) => save({ ...values, notifyNewRelease: checked })}
          disabled={pending}
          label="Új kiadás a követett projektekből"
          description="E-mail és in-app értesítés, amint megjelenik egy új rész."
        />

        <Switch
          checked={values.notifyNewsPost}
          onChange={(checked) => save({ ...values, notifyNewsPost: checked })}
          disabled={pending}
          label="Új hír a csapattól"
          description="Bejelentések, projektindítások."
        />

        <Switch
          checked={values.notifyCommentReply}
          onChange={(checked) => save({ ...values, notifyCommentReply: checked })}
          disabled={pending}
          label="Válasz a hozzászólásomra"
        />

        <div className="border-t border-border-subtle pt-5">
          <Field label="E-mail összefoglaló" hint="Egyetlen levél több értesítés helyett.">
            {({ id }) => (
              <Select
                id={id}
                value={values.emailDigest}
                onChange={(event) =>
                  save({ ...values, emailDigest: event.target.value as PreferenceValues['emailDigest'] })
                }
                disabled={pending}
              >
                <option value="off">Kikapcsolva (azonnali értesítés)</option>
                <option value="daily">Napi összefoglaló</option>
                <option value="weekly">Heti összefoglaló</option>
              </Select>
            )}
          </Field>
        </div>

        <div className="border-t border-border-subtle pt-5">
          <Switch
            checked={values.reducedMotion}
            onChange={(checked) => save({ ...values, reducedMotion: checked })}
            disabled={pending}
            label="Csökkentett animáció"
            description="A rendszerbeállításodat egyébként is tiszteletben tartjuk; ezzel felül tudod bírálni."
          />
        </div>
      </CardBody>
    </Card>
  );
}

export function PasswordForm() {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setFieldErrors({});
    setFormError(null);

    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      await apiFetch('/api/v1/auth/password/change', {
        method: 'POST',
        body: {
          currentPassword: String(data.get('currentPassword') ?? ''),
          password: String(data.get('password') ?? ''),
          passwordConfirmation: String(data.get('passwordConfirmation') ?? ''),
        },
      });

      form.reset();
      toast.success(
        'Jelszó megváltoztatva',
        'A többi eszközödön kiléptettünk a biztonság kedvéért.',
      );
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

  return (
    <Card>
      <CardHeader
        title="Jelszó"
        description="Változtatás után minden más eszközön kiléptetünk."
      />
      <CardBody>
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {formError && <InlineError message={formError} />}

          <Field label="Jelenlegi jelszó" required error={fieldErrors.currentPassword}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
                invalid={invalid}
                aria-describedby={describedBy}
              />
            )}
          </Field>

          <Field label="Új jelszó" required error={fieldErrors.password}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                name="password"
                type="password"
                autoComplete="new-password"
                required
                invalid={invalid}
                aria-describedby={describedBy}
              />
            )}
          </Field>

          <Field label="Új jelszó megerősítése" required error={fieldErrors.passwordConfirmation}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                name="passwordConfirmation"
                type="password"
                autoComplete="new-password"
                required
                invalid={invalid}
                aria-describedby={describedBy}
              />
            )}
          </Field>

          <Button
            type="submit"
            variant="secondary"
            size="md"
            loading={pending}
            leadingIcon={<KeyRound className="size-4" aria-hidden />}
          >
            Jelszó módosítása
          </Button>

          <p className="flex items-start gap-2 text-2xs leading-relaxed text-mist-600">
            <ShieldCheck className="mt-px size-3.5 shrink-0 text-mist-500" aria-hidden />
            A jelszavakat scrypt algoritmussal, egyedi sózással tároljuk. A nyers jelszavadat
            senki — sem mi, sem egy esetleges támadó adatbázis-másolattal — nem tudja
            visszafejteni.
          </p>
        </form>
      </CardBody>
    </Card>
  );
}
