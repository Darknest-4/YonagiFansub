'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CheckCircle2, KeyRound, MailCheck } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Field, Input } from '@/shared/ui/field';
import { InlineError } from '@/shared/ui/feedback';
import { ApiError, apiFetch, type FieldErrors } from '@/shared/api/client';
import { evaluatePasswordStrength } from '@/features/auth/password-policy';

/**
 * Step 1 — request a reset link.
 *
 * The success state is shown for *every* submission, including addresses that do
 * not exist. Anything else turns this form into an account-enumeration oracle:
 * an attacker could test a list of emails and learn which ones are registered.
 */
export function ForgotPasswordForm() {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setFormError(null);
    setFieldErrors({});

    const data = new FormData(event.currentTarget);

    try {
      await apiFetch('/api/v1/auth/password/forgot', {
        method: 'POST',
        body: {
          email: String(data.get('email') ?? ''),
          website: String(data.get('website') ?? ''),
        },
      });
      setSent(true);
    } catch (error) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fields);
        setFormError(Object.keys(error.fields).length === 0 ? error.message : null);
      } else {
        setFormError('Váratlan hiba történt. Próbáld újra.');
      }
    } finally {
      setPending(false);
    }
  };

  if (sent) {
    return (
      <div>
        <div className="mb-5 grid size-12 place-items-center rounded-2xl border border-success-500/30 bg-success-500/10 text-success-400">
          <MailCheck className="size-6" aria-hidden />
        </div>

        <h1 className="text-2xl">Nézd meg a postaládád</h1>
        <p className="mt-3 text-sm leading-relaxed text-content-muted">
          Ha tartozik fiók a megadott e-mail-címhez, elküldtük rá a jelszó-visszaállító
          linket. A link egy órán át érvényes, és csak egyszer használható fel.
        </p>
        <p className="mt-4 text-xs leading-relaxed text-mist-600">
          Nem érkezett meg? Nézd meg a spam mappát, vagy próbáld újra néhány perc múlva.
        </p>

        <Link
          href="/belepes"
          className="mt-7 inline-block text-sm font-medium text-bloom-300 underline-offset-4 hover:underline"
        >
          Vissza a bejelentkezéshez
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl">Elfelejtett jelszó</h1>
      <p className="mt-2 text-sm text-content-muted">
        Add meg az e-mail-címed, és küldünk egy linket az új jelszó beállításához.
      </p>

      <form onSubmit={handleSubmit} noValidate className="mt-7 space-y-4">
        {formError && <InlineError message={formError} />}

        <Field label="E-mail-cím" required error={fieldErrors.email}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="email"
              type="email"
              autoComplete="email"
              autoFocus
              required
              invalid={invalid}
              aria-describedby={describedBy}
              placeholder="te@example.com"
            />
          )}
        </Field>

        <div aria-hidden className="absolute size-px overflow-hidden opacity-0">
          <label htmlFor="fp-website">Ne töltsd ki</label>
          <input id="fp-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>

        <Button type="submit" variant="primary" size="lg" fullWidth loading={pending}>
          Visszaállító link kérése
        </Button>
      </form>

      <p className="mt-7 text-center text-sm text-content-muted">
        Mégis eszedbe jutott?{' '}
        <Link href="/belepes" className="font-medium text-bloom-300 underline-offset-4 hover:underline">
          Bejelentkezés
        </Link>
      </p>
    </div>
  );
}

/** Step 2 — set the new password with the token from the email. */
export function ResetPasswordForm({ token }: { token: string }) {
  const [pending, setPending] = useState(false);
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const strength = useMemo(() => evaluatePasswordStrength(password), [password]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setFormError(null);
    setFieldErrors({});

    const data = new FormData(event.currentTarget);

    try {
      await apiFetch('/api/v1/auth/password/reset', {
        method: 'POST',
        body: {
          token,
          password: String(data.get('password') ?? ''),
          passwordConfirmation: String(data.get('passwordConfirmation') ?? ''),
        },
      });

      window.location.assign('/belepes?reset=1');
    } catch (error) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fields);
        setFormError(Object.keys(error.fields).length === 0 ? error.message : null);
      } else {
        setFormError('Váratlan hiba történt. Próbáld újra.');
      }
      setPending(false);
    }
  };

  return (
    <div>
      <div className="mb-5 grid size-12 place-items-center rounded-2xl border border-bloom-400/30 bg-bloom-400/10 text-bloom-300">
        <KeyRound className="size-6" aria-hidden />
      </div>

      <h1 className="text-2xl">Új jelszó beállítása</h1>
      <p className="mt-2 text-sm text-content-muted">
        A mentés után minden más eszközön kiléptetünk — így biztos, hogy csak te férsz
        hozzá a fiókodhoz.
      </p>

      <form onSubmit={handleSubmit} noValidate className="mt-7 space-y-4">
        {formError && <InlineError message={formError} />}

        <Field label="Új jelszó" required error={fieldErrors.password}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="password"
              type="password"
              autoComplete="new-password"
              autoFocus
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              invalid={invalid}
              aria-describedby={describedBy}
            />
          )}
        </Field>

        {password.length > 0 && strength.problems.length > 0 && (
          <ul className="space-y-1">
            {strength.problems.map((problem) => (
              <li key={problem} className="text-2xs text-mist-500">
                • {problem}
              </li>
            ))}
          </ul>
        )}

        {password.length > 0 && strength.problems.length === 0 && (
          <p className="flex items-center gap-1.5 text-2xs text-success-400">
            <CheckCircle2 className="size-3.5" aria-hidden />
            A jelszó megfelel a követelményeknek.
          </p>
        )}

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
          variant="primary"
          size="lg"
          fullWidth
          loading={pending}
          disabled={strength.problems.length > 0}
        >
          Jelszó mentése
        </Button>
      </form>
    </div>
  );
}
