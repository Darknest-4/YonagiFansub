import { z } from 'zod';
import '@/shared/validation/error-map';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@/features/auth/password-policy';

/**
 * Shared validation primitives.
 *
 * These schemas are imported by both the API route definitions and the client
 * forms. Validating with the same schema on both sides means the browser can
 * give instant feedback without the server ever trusting it.
 */


export const cuid = z.string().cuid({ message: 'Érvénytelen azonosító.' });

export const slug = z
  .string()
  .min(1, 'Kötelező mező.')
  .max(96, 'Legfeljebb 96 karakter.')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Csak kisbetű, szám és kötőjel használható.');

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Kötelező mező.')
  .max(254, 'Túl hosszú e-mail-cím.')
  .email('Érvénytelen e-mail-cím.');

export const username = z
  .string()
  .trim()
  .min(3, 'Legalább 3 karakter.')
  .max(24, 'Legfeljebb 24 karakter.')
  .regex(/^[a-zA-Z0-9_]+$/, 'Csak betű, szám és alulvonás használható.')
  .refine((value) => !/^_+$/.test(value), 'A felhasználónév nem állhat csak alulvonásból.');

export const displayName = z
  .string()
  .trim()
  .min(2, 'Legalább 2 karakter.')
  .max(48, 'Legfeljebb 48 karakter.');

export const password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Legalább ${PASSWORD_MIN_LENGTH} karakter.`)
  .max(PASSWORD_MAX_LENGTH, `Legfeljebb ${PASSWORD_MAX_LENGTH} karakter.`);

/** Accepts an absolute http(s) URL or a site-relative path; rejects everything else. */
export const safeUrl = z
  .string()
  .trim()
  .max(2048, 'Túl hosszú URL.')
  .refine(
    (value) =>
      value === '' ||
      (value.startsWith('/') && !value.startsWith('//')) ||
      /^https?:\/\/\S+$/i.test(value),
    'Csak http(s) URL vagy oldalon belüli útvonal adható meg.',
  );

/*
  `nullish`, not `optional`. These helpers emit `null` for an absent value, so
  they have to accept `null` on the way back in — otherwise a client that reads a
  record and submits it unchanged is rejected on every empty field, which is
  exactly what a normal edit form does. `nullableDate` below already got this
  right; these two did not.
*/
export const optionalUrl = safeUrl
  .nullish()
  .or(z.literal(''))
  .transform((value) => value || null);

export const hexColor = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Érvénytelen színkód (pl. #f761a8).');

/** Percentage used by the workflow progress fields. */
export const percent = z.coerce
  .number()
  .int('Egész szám legyen.')
  .min(0, 'Legalább 0.')
  .max(100, 'Legfeljebb 100.');

export const isoDate = z
  .string()
  .datetime({ offset: true, message: 'Érvénytelen dátum.' })
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Érvénytelen dátum.'));

export const nullableDate = z
  .union([isoDate, z.literal(''), z.null()])
  .optional()
  .transform((value) => (value ? new Date(value) : null));

/**
 * Free-text body with a length ceiling. Note that no HTML stripping happens
 * here: output escaping is the defence (see `lib/markdown.ts`), because
 * stripping on input silently corrupts legitimate content like `a < b`.
 */
export function text(min: number, max: number, label = 'Ez a mező') {
  return z
    .string()
    .trim()
    .min(min, min === 1 ? 'Kötelező mező.' : `${label} legalább ${min} karakter legyen.`)
    .max(max, `${label} legfeljebb ${max} karakter lehet.`);
}

export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Legfeljebb ${max} karakter.`)
    .nullish()
    .transform((value) => value || null);

/**
 * Honeypot field. Bots fill every input they find; humans never see this one.
 * A non-empty value means the submission is discarded silently.
 */
export const honeypot = z
  .string()
  .max(0, 'Érvénytelen kérés.')
  .optional()
  .or(z.literal(''));

export const booleanFlag = z
  .union([z.boolean(), z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0')])
  .transform((value) => value === true || value === 'true' || value === '1');
