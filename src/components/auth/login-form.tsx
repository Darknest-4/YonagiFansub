'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input } from '@/components/ui/field';
import { InlineError } from '@/components/ui/feedback';
import { ApiError, apiFetch, type FieldErrors } from '@/lib/client/api';
import { safeRedirectPath } from '@/lib/utils';

/**
 * Login form.
 *
 * The `next` parameter is passed through `safeRedirectPath`, which only accepts
 * same-origin relative paths. Without that filter, `?next=https://evil.example`
 * turns the login page into an open redirect — a phishing primitive that looks
 * entirely legitimate because it starts on the real domain.
 */
export function LoginForm() {
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [showPassword, setShowPassword] = useState(false);

  const next = safeRedirectPath(searchParams.get('next'), '/');
  const registeredParam = searchParams.get('registered');
  const justRegistered = registeredParam === '1';
  // Az első fiók a telepítésen: tulajdonos, azonnal beléphet.
  const registeredAsOwner = registeredParam === 'owner';
  const justVerified = searchParams.get('verified') === '1';
  const justReset = searchParams.get('reset') === '1';

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setFormError(null);
    setFieldErrors({});

    const data = new FormData(event.currentTarget);

    try {
      await apiFetch('/api/v1/auth/login', {
        method: 'POST',
        body: {
          email: String(data.get('email') ?? ''),
          password: String(data.get('password') ?? ''),
          remember: data.get('remember') === 'on',
        },
      });

      // A full navigation rather than a client push: the session cookie changes
      // what every server component renders, so the whole tree must re-fetch.
      window.location.assign(next);
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
      <h1 className="text-2xl">Üdv újra itt</h1>
      <p className="mt-2 text-sm text-content-muted">
        Jelentkezz be a fiókodba a folytatáshoz.
      </p>

      {justRegistered && (
        <p
          role="status"
          className="mt-5 rounded-lg border border-success-500/25 bg-success-900/25 px-3.5 py-3 text-sm text-success-400"
        >
          Sikeres regisztráció! Küldtünk egy megerősítő linket az e-mail-címedre.
        </p>
      )}

      {registeredAsOwner && (
        <div
          role="status"
          className="mt-5 rounded-lg border border-bloom-400/30 bg-bloom-400/8 px-3.5 py-3 text-sm"
        >
          <p className="font-medium text-bloom-200">
            Ez volt az első fiók — megkaptad a tulajdonosi jogosultságot.
          </p>
          <p className="mt-1 leading-relaxed text-mist-300">
            E-mail-megerősítés nélkül is beléphetsz. Belépés után az
            Admin → Beállítások alatt tudod felvenni az oldal adatait.
          </p>
        </div>
      )}

      {justVerified && (
        <p
          role="status"
          className="mt-5 rounded-lg border border-success-500/25 bg-success-900/25 px-3.5 py-3 text-sm text-success-400"
        >
          Az e-mail-címed megerősítve. Most már be tudsz lépni.
        </p>
      )}

      {justReset && (
        <p
          role="status"
          className="mt-5 rounded-lg border border-success-500/25 bg-success-900/25 px-3.5 py-3 text-sm text-success-400"
        >
          Az új jelszavad elmentve. Lépj be vele.
        </p>
      )}

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

        <Field label="Jelszó" required error={fieldErrors.password}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
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

        <div className="flex items-center justify-between gap-4">
          <Checkbox name="remember" label="Maradjak bejelentkezve" defaultChecked />

          <Link
            href="/jelszo-visszaallitas"
            className="shrink-0 text-xs text-bloom-300 underline-offset-4 hover:underline"
          >
            Elfelejtettem
          </Link>
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          loading={pending}
          leadingIcon={<LogIn className="size-4" aria-hidden />}
        >
          Bejelentkezés
        </Button>
      </form>

      <p className="mt-7 text-center text-sm text-content-muted">
        Még nincs fiókod?{' '}
        <Link
          href={next === '/' ? '/regisztracio' : `/regisztracio?next=${encodeURIComponent(next)}`}
          className="font-medium text-bloom-300 underline-offset-4 hover:underline"
        >
          Regisztrálj
        </Link>
      </p>

      {/*
        Aki regisztrált, de nem kapta meg a megerősítő levelet, itt akad el —
        és eddig nem volt hova mennie. Halványabb, mint a regisztráció: nem ez a
        gyakori eset, de aki keresi, annak pont itt kell lennie.
      */}
      <p className="mt-2 text-center text-2xs text-mist-600">
        Nem jött meg a megerősítő e-mail?{' '}
        <Link
          href="/megerosites-ujrakuldes"
          className="text-mist-400 underline decoration-mist-600 underline-offset-4 hover:text-bloom-300 hover:decoration-bloom-300"
        >
          Küldjük újra
        </Link>
      </p>
    </div>
  );
}
