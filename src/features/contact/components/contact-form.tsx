'use client';

import { useState } from 'react';
import { CheckCircle2, Send } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Checkbox, Field, Input, Select, Textarea } from '@/shared/ui/field';
import { InlineError } from '@/shared/ui/feedback';
import { useToast } from '@/shared/ui/toast';
import { ApiError, apiFetch, type FieldErrors } from '@/shared/api/client';

const CATEGORIES = [
  { value: 'GENERAL', label: 'Általános kérdés' },
  { value: 'PROJECT_REQUEST', label: 'Projektjavaslat' },
  { value: 'BUG_REPORT', label: 'Hibabejelentés' },
  { value: 'JOIN_TEAM', label: 'Csatlakoznék a csapathoz' },
  { value: 'TAKEDOWN', label: 'Jogi megkeresés' },
  { value: 'BUSINESS', label: 'Együttműködés' },
] as const;

/**
 * Contact form.
 *
 * Notes on the interaction:
 *   • Server-side field errors are mapped back onto the inputs by name, so a
 *     rejected submission points at the field that caused it instead of showing
 *     one generic banner at the top.
 *   • The success state replaces the form rather than sitting above it: leaving
 *     a filled-in form on screen after a successful send invites a double post.
 *   • The honeypot is a real input, hidden from sight *and* from assistive tech,
 *     with `tabIndex={-1}` so a keyboard user can never land in it.
 */
export function ContactForm({ defaultCategory }: { defaultCategory?: string }) {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [body, setBody] = useState('');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setFieldErrors({});
    setFormError(null);

    const data = new FormData(event.currentTarget);

    try {
      await apiFetch('/api/v1/contact', {
        method: 'POST',
        body: {
          name: String(data.get('name') ?? ''),
          email: String(data.get('email') ?? ''),
          subject: String(data.get('subject') ?? ''),
          body: String(data.get('body') ?? ''),
          category: String(data.get('category') ?? 'GENERAL'),
          acceptPrivacy: data.get('acceptPrivacy') === 'on',
          website: String(data.get('website') ?? ''),
        },
      });

      setSent(true);
      toast.success('Üzenet elküldve', 'Köszönjük! Hamarosan válaszolunk.');
    } catch (error) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fields);
        // A field-level failure is already shown next to the input; only show
        // the banner for errors that have no field to attach to.
        if (Object.keys(error.fields).length === 0) setFormError(error.message);
        else setFormError(null);
      } else {
        setFormError('Váratlan hiba történt. Próbáld újra néhány perc múlva.');
      }
    } finally {
      setPending(false);
    }
  };

  if (sent) {
    return (
      <div className="rounded-2xl border border-success-500/25 bg-success-900/20 px-6 py-12 text-center">
        <div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl border border-success-500/30 bg-success-500/10 text-success-400">
          <CheckCircle2 className="size-7" aria-hidden />
        </div>
        <h2 className="text-lg font-semibold text-mist-50">Megkaptuk az üzeneted</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-content-muted">
          Küldtünk egy visszaigazolást a megadott címre. A csapat általában 2–5 napon belül
          válaszol — türelmedet köszönjük.
        </p>
        <Button variant="ghost" size="sm" className="mt-6" onClick={() => setSent(false)}>
          Új üzenet írása
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {formError && <InlineError message={formError} />}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Neved" required error={fieldErrors.name}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="name"
              autoComplete="name"
              maxLength={80}
              required
              invalid={invalid}
              aria-describedby={describedBy}
              placeholder="Kovács Anna"
            />
          )}
        </Field>

        <Field
          label="E-mail-cím"
          required
          hint="Ide küldjük a választ."
          error={fieldErrors.email}
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              required
              invalid={invalid}
              aria-describedby={describedBy}
              placeholder="anna@example.com"
            />
          )}
        </Field>
      </div>

      <Field label="Miről van szó?" error={fieldErrors.category}>
        {({ id, describedBy }) => (
          <Select id={id} name="category" defaultValue={defaultCategory ?? 'GENERAL'} aria-describedby={describedBy}>
            {CATEGORIES.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label="Tárgy" required error={fieldErrors.subject}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="subject"
            maxLength={160}
            required
            invalid={invalid}
            aria-describedby={describedBy}
            placeholder="Röviden: mi a kérdés?"
          />
        )}
      </Field>

      <Field
        label="Üzenet"
        required
        hint="Minél konkrétabb vagy, annál hamarabb tudunk érdemben válaszolni."
        error={fieldErrors.body}
      >
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            name="body"
            rows={7}
            minLength={20}
            maxLength={5000}
            required
            showCount
            value={body}
            onChange={(event) => setBody(event.target.value)}
            invalid={invalid}
            aria-describedby={describedBy}
            placeholder="Írd le, miben segíthetünk…"
          />
        )}
      </Field>

      {/* Honeypot: invisible to humans and to assistive technology. */}
      <div aria-hidden className="absolute size-px overflow-hidden opacity-0">
        <label htmlFor="website">Ne töltsd ki</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <Checkbox
        name="acceptPrivacy"
        required
        label="Elfogadom az adatkezelési tájékoztatót"
        description="Az üzenetedet és az e-mail-címedet kizárólag a válaszadáshoz használjuk."
      />
      {fieldErrors.acceptPrivacy && (
        <p role="alert" className="text-xs text-danger-400">
          {fieldErrors.acceptPrivacy.join(' ')}
        </p>
      )}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        loading={pending}
        trailingIcon={<Send className="size-4" aria-hidden />}
      >
        Üzenet küldése
      </Button>
    </form>
  );
}
