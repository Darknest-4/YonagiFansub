'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Check, Eye, EyeOff, UserPlus, X } from 'lucide-react';
import { cn, safeRedirectPath } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Checkbox, Field, Input } from '@/shared/ui/field';
import { InlineError } from '@/shared/ui/feedback';
import { ApiError, apiFetch, type FieldErrors } from '@/shared/api/client';
import {
  STRENGTH_LABELS,
  evaluatePasswordStrength,
} from '@/features/auth/password-policy';

/**
 * Registration form.
 *
 * The strength meter runs `evaluatePasswordStrength` — the exact same function
 * the API uses to accept or reject the password. That is the whole point of
 * keeping the policy in a shared, server-free module: the browser can never
 * promise a password the server will refuse.
 */
export function RegisterForm() {
  const searchParams = useSearchParams();
  const next = safeRedirectPath(searchParams.get('next'), '/');

  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [showPassword, setShowPassword] = useState(false);

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const strength = useMemo(
    () => evaluatePasswordStrength(password, [username, email.split('@')[0] ?? '']),
    [password, username, email],
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setFormError(null);
    setFieldErrors({});

    const data = new FormData(event.currentTarget);

    try {
      const result = await apiFetch<{ isOwner: boolean }>('/api/v1/auth/register', {
        method: 'POST',
        body: {
          email: String(data.get('email') ?? ''),
          username: String(data.get('username') ?? ''),
          displayName: String(data.get('displayName') ?? ''),
          password: String(data.get('password') ?? ''),
          passwordConfirmation: String(data.get('passwordConfirmation') ?? ''),
          acceptTerms: data.get('acceptTerms') === 'on',
          website: String(data.get('website') ?? ''),
        },
      });

      const params = new URLSearchParams({ registered: result.isOwner ? 'owner' : '1' });
      if (next !== '/') params.set('next', next);
      window.location.assign(`/belepes?${params}`);
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
      <h1 className="text-2xl">Fiók létrehozása</h1>
      <p className="mt-2 text-sm text-content-muted">
        Ingyenes, és fél percbe telik. Semmi mást nem kérünk, csak egy e-mail-címet.
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
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              invalid={invalid}
              aria-describedby={describedBy}
              placeholder="te@example.com"
            />
          )}
        </Field>

        <Field
          label="Felhasználónév"
          required
          hint="3–24 karakter, betű, szám és alulvonás."
          error={fieldErrors.username}
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="username"
              autoComplete="username"
              required
              minLength={3}
              maxLength={24}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              invalid={invalid}
              aria-describedby={describedBy}
              placeholder="yonagi_fan"
            />
          )}
        </Field>

        <Field
          label="Megjelenített név"
          required
          hint="Ezt látják mások a hozzászólásaidnál."
          error={fieldErrors.displayName}
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="displayName"
              autoComplete="nickname"
              required
              maxLength={48}
              invalid={invalid}
              aria-describedby={describedBy}
              placeholder="Anna"
            />
          )}
        </Field>

        <Field label="Jelszó" required error={fieldErrors.password}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              invalid={invalid}
              aria-describedby={describedBy}
              trailingSlot={
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Jelszó elrejtése' : 'Jelszó megjelenítése'}
                  className="rounded-md p-2 text-mist-500 transition-colors hover:text-mist-200"
                >
                  {showPassword ? (
                    <EyeOff className="size-4" aria-hidden />
                  ) : (
                    <Eye className="size-4" aria-hidden />
                  )}
                </button>
              }
            />
          )}
        </Field>

        {password.length > 0 && <StrengthMeter strength={strength} />}

        <Field label="Jelszó megerősítése" required error={fieldErrors.passwordConfirmation}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="passwordConfirmation"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              invalid={invalid}
              aria-describedby={describedBy}
            />
          )}
        </Field>

        <div aria-hidden className="absolute size-px overflow-hidden opacity-0">
          <label htmlFor="reg-website">Ne töltsd ki</label>
          <input id="reg-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>

        <Checkbox
          name="acceptTerms"
          required
          label={
            <>
              Elfogadom a{' '}
              <Link href="/felhasznalasi-feltetelek" className="text-bloom-300 underline-offset-4 hover:underline">
                felhasználási feltételeket
              </Link>{' '}
              és az{' '}
              <Link href="/adatkezeles" className="text-bloom-300 underline-offset-4 hover:underline">
                adatkezelési tájékoztatót
              </Link>
            </>
          }
        />
        {fieldErrors.acceptTerms && (
          <p role="alert" className="text-xs text-danger-400">
            {fieldErrors.acceptTerms.join(' ')}
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          loading={pending}
          leadingIcon={<UserPlus className="size-4" aria-hidden />}
        >
          Regisztráció
        </Button>
      </form>

      <p className="mt-7 text-center text-sm text-content-muted">
        Van már fiókod?{' '}
        <Link
          href={next === '/' ? '/belepes' : `/belepes?next=${encodeURIComponent(next)}`}
          className="font-medium text-bloom-300 underline-offset-4 hover:underline"
        >
          Jelentkezz be
        </Link>
      </p>
    </div>
  );
}

function StrengthMeter({
  strength,
}: {
  strength: ReturnType<typeof evaluatePasswordStrength>;
}) {
  const colors = [
    'bg-danger-500',
    'bg-danger-400',
    'bg-warning-400',
    'bg-success-500',
    'bg-success-400',
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1" aria-hidden>
          {[0, 1, 2, 3, 4].map((step) => (
            <span
              key={step}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors duration-base',
                step <= strength.score ? colors[strength.score] : 'bg-ink-750',
              )}
            />
          ))}
        </div>
        <span
          className="w-20 shrink-0 text-right text-2xs text-mist-400"
          aria-live="polite"
        >
          {STRENGTH_LABELS[strength.score]}
        </span>
      </div>

      {strength.problems.length > 0 ? (
        <ul className="space-y-1">
          {strength.problems.map((problem) => (
            <li key={problem} className="flex items-start gap-1.5 text-2xs text-mist-500">
              <X className="mt-px size-3 shrink-0 text-danger-400" aria-hidden />
              {problem}
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-1.5 text-2xs text-success-400">
          <Check className="size-3" aria-hidden />
          A jelszó megfelel a követelményeknek.
        </p>
      )}
    </div>
  );
}
