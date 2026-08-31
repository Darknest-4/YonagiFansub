'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { InlineError } from '@/components/ui/feedback';
import { ApiError, apiFetch, type FieldErrors } from '@/lib/client/api';

/**
 * "The confirmation email never arrived."
 *
 * Built as a near-twin of the forgotten-password form, on purpose: it solves
 * the same shape of problem (a link that should have reached an inbox and did
 * not), and someone who has used one should not have to learn the other.
 *
 * The confirmation screen says the same thing whether or not the address has an
 * account, because the server answers the same way. That is the point — an
 * unauthenticated endpoint that distinguishes "sent" from "no such user" is a
 * way to test which addresses are registered here.
 */
export function ResendVerificationForm() {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setFormError(null);
    setFieldErrors({});

    const form = new FormData(event.currentTarget);

    try {
      await apiFetch('/api/v1/auth/verify/resend', {
        method: 'POST',
        body: {
          email: String(form.get('email') ?? ''),
          website: String(form.get('website') ?? ''),
        },
      });
      setDone(true);
    } catch (error) {
      if (error instanceof ApiError && error.isValidation) {
        setFieldErrors(error.fields);
      } else {
        setFormError(
          error instanceof ApiError ? error.message : 'A kérés most nem sikerült.',
        );
      }
    } finally {
      setPending(false);
    }
  };

  if (done) {
    return (
      <div>
        <h1 className="text-2xl">Nézd meg a postaládád</h1>
        <p className="mt-3 text-sm leading-relaxed text-content-muted">
          Ha tartozik megerősítetlen fiók a megadott címhez, újraküldtük rá a megerősítő
          linket. Az újraküldés minden korábbi linket érvénytelenít, tehát a legfrissebb
          levélben lévő működik.
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
      <h1 className="text-2xl">Megerősítő e-mail újraküldése</h1>
      <p className="mt-2 text-sm text-content-muted">
        Add meg a címet, amivel regisztráltál, és küldünk egy új megerősítő linket.
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

        {/* Honeypot: a bot fills every field it finds, a person never sees this. */}
        <div aria-hidden className="absolute size-px overflow-hidden opacity-0">
          <label htmlFor="rv-website">Ne töltsd ki</label>
          <input id="rv-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
        </div>

        <Button type="submit" variant="primary" size="lg" fullWidth loading={pending}>
          Megerősítő link küldése
        </Button>
      </form>

      <p className="mt-7 text-center text-sm text-content-muted">
        Már megerősítetted?{' '}
        <Link href="/belepes" className="font-medium text-bloom-300 underline-offset-4 hover:underline">
          Bejelentkezés
        </Link>
      </p>
    </div>
  );
}
