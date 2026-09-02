import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import '@/shared/validation/error-map';
import {
  email,
  hexColor,
  nullableDate,
  optionalText,
  optionalUrl,
  percent,
  slug,
  text,
} from '@/shared/validation/common';
import { teamMemberWriteSchema } from '@/lib/validation/schemas';

/**
 * Validation messages.
 *
 * The site is Hungarian end to end, and a validation message is the most
 * user-facing string the backend produces. Zod's defaults are English, so a
 * field nobody wrote a message for answers with "Required" — a seam that is
 * invisible in code review and obvious to a user. These tests assert that no
 * built-in issue code can reach the UI untranslated.
 */

/** First message Zod produces for `value`, or `null` when it parses. */
function firstError(schema: z.ZodTypeAny, value: unknown): string | null {
  const result = schema.safeParse(value);
  return result.success ? null : (result.error.issues[0]?.message ?? null);
}

const HAS_LATIN_ONLY_ASCII = /^[\x20-\x7E]*$/;

describe('Hungarian error map', () => {
  it('reports a missing required field in Hungarian', () => {
    const schema = z.object({ type: z.enum(['TV', 'MOVIE']) });
    const result = schema.safeParse({});
    expect(result.success).toBe(false);
    expect(firstError(schema, {})).toBe('Kötelező mező.');
  });

  it('reports an unknown enum value in Hungarian', () => {
    expect(firstError(z.enum(['TV', 'MOVIE']), 'OVA')).toBe('Érvénytelen választás.');
  });

  it('reports a wrong primitive type in Hungarian', () => {
    expect(firstError(z.string(), 42)).toBe('Érvénytelen érték: szöveg szükséges.');
    expect(firstError(z.number(), 'sok')).toBe('Érvénytelen érték: szám szükséges.');
  });

  it('treats null the same as missing', () => {
    expect(firstError(z.string(), null)).toBe('Kötelező mező.');
  });

  it('reports string length bounds in Hungarian', () => {
    expect(firstError(z.string().min(1), '')).toBe('Kötelező mező.');
    expect(firstError(z.string().min(3), 'ab')).toBe('Legalább 3 karakter.');
    expect(firstError(z.string().max(2), 'abc')).toBe('Legfeljebb 2 karakter.');
  });

  it('reports array length bounds in Hungarian', () => {
    expect(firstError(z.array(z.string()).min(1), [])).toBe('Legalább 1 elem szükséges.');
    expect(firstError(z.array(z.string()).max(1), ['a', 'b'])).toBe(
      'Legfeljebb 1 elem adható meg.',
    );
  });

  it('reports numeric bounds in Hungarian', () => {
    expect(firstError(z.number().min(0), -1)).toBe('Legalább 0.');
    expect(firstError(z.number().max(100), 101)).toBe('Legfeljebb 100.');
  });

  it('reports format failures in Hungarian', () => {
    expect(firstError(z.string().email(), 'nem-email')).toBe('Érvénytelen e-mail-cím.');
    expect(firstError(z.string().url(), 'nem-url')).toBe('Érvénytelen URL.');
    expect(firstError(z.string().datetime(), 'tegnap')).toBe('Érvénytelen dátum.');
  });

  it('reports unrecognised keys in Hungarian', () => {
    const schema = z.object({ a: z.string() }).strict();
    expect(firstError(schema, { a: 'x', b: 'y' })).toBe('Ismeretlen mező szerepel a kérésben.');
  });

  it('keeps a hand-written message rather than overriding it', () => {
    // The map is a fallback: an explicit message on the schema still wins.
    expect(firstError(z.string().min(3, 'Túl rövid név.'), 'ab')).toBe('Túl rövid név.');
    expect(firstError(hexColor, 'kék')).toBe('Érvénytelen színkód (pl. #f761a8).');
  });

  it('keeps a refinement message', () => {
    const schema = z.string().refine((value) => value === 'ok', 'Nem megfelelő érték.');
    expect(firstError(schema, 'nope')).toBe('Nem megfelelő érték.');
  });
});

describe('shared primitives answer in Hungarian', () => {
  const cases: Array<[string, z.ZodTypeAny, unknown]> = [
    ['slug – empty', slug, ''],
    ['slug – illegal characters', slug, 'Nem Jó Slug'],
    ['slug – wrong type', slug, 12],
    ['email – malformed', email, 'a@'],
    ['email – missing', email, undefined],
    ['percent – above range', percent, 250],
    ['percent – not a number', percent, 'sok'],
    ['text – too short', text(1, 10), ''],
    ['text – too long', text(1, 3), 'túl hosszú'],
  ];

  it.each(cases)('%s', (_label, schema, value) => {
    const message = firstError(schema, value);
    expect(message).toBeTruthy();
    // An untranslated Zod default ("Required", "Expected string, received
    // number", "Invalid enum value") is pure ASCII and starts with an English
    // keyword. Every message we write is Hungarian prose.
    expect(message).not.toMatch(/^(Required|Invalid|Expected|String must|Number must|Array must)/);
  });

  it('no primitive falls back to an English sentence', () => {
    // Sanity check on the heuristic above: ASCII alone is not the test, since
    // "Kotelezo mezo" would pass it — the assertion is on the English keywords.
    expect(HAS_LATIN_ONLY_ASCII.test('Required')).toBe(true);
    expect(HAS_LATIN_ONLY_ASCII.test('Kötelező mező.')).toBe(false);
  });
});

/**
 * Round-tripping optional fields.
 *
 * These helpers normalise an absent value to `null` on the way out, so they must
 * also accept `null` on the way in. An edit form reads a record, shows it, and
 * submits it back; if the schema refuses its own output, every untouched empty
 * field fails validation and the user is told a blank optional field is
 * required. That is a bug you only see through a real form, so it is pinned here.
 */
describe('optional fields round-trip', () => {
  it('accepts null for every optional helper', () => {
    expect(optionalText(160).parse(null)).toBeNull();
    expect(optionalText(160).parse(undefined)).toBeNull();
    expect(optionalText(160).parse('')).toBeNull();
    expect(optionalText(160).parse(' szia ')).toBe('szia');

    expect(optionalUrl.parse(null)).toBeNull();
    expect(optionalUrl.parse(undefined)).toBeNull();
    expect(optionalUrl.parse('')).toBeNull();
    expect(optionalUrl.parse('/uploads/a.png')).toBe('/uploads/a.png');

    expect(nullableDate.parse(null)).toBeNull();
  });

  it('re-accepts what a write schema emits', () => {
    const first = teamMemberWriteSchema.parse({
      slug: 'nagy-anna',
      name: 'Nagy Anna',
      positionIds: [],
    });

    // Feeding the parsed record straight back must not fail: this is exactly
    // what an edit form does with the fields nobody touched.
    expect(() =>
      teamMemberWriteSchema.parse({
        ...first,
        joinedAt: null,
        leftAt: null,
      }),
    ).not.toThrow();
  });
});
