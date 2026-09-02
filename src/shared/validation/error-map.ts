import { z } from 'zod';

/**
 * Hungarian fallback for Zod's built-in messages.
 *
 * Every hand-written message in this file overrides it; this covers the ones
 * nobody thinks to write — a missing enum field, a number where a string was
 * expected, a malformed date. Without it a Hungarian form answers a missing
 * `type` with the English word "Required", which is exactly the kind of seam a
 * user notices and a reviewer calls unfinished.
 *
 * This module has a side effect and no exports on purpose: it is imported for
 * `z.setErrorMap` alone, from the three entry points every parse passes
 * through — `validation/common` (schemas and client forms), `api/pagination`
 * (list query strings), and `api/handler` (every route). Importing it from the
 * schema modules only would leave the routes that build a one-off `z.object()`
 * inline answering in English.
 */
const HUNGARIAN_TYPE_NAMES: Partial<Record<z.ZodParsedType, string>> = {
  string: 'szöveg',
  number: 'szám',
  boolean: 'igen/nem érték',
  date: 'dátum',
  array: 'lista',
  object: 'objektum',
};

z.setErrorMap((issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      if (issue.received === 'undefined' || issue.received === 'null') return { message: 'Kötelező mező.' };
      return {
        message: `Érvénytelen érték: ${HUNGARIAN_TYPE_NAMES[issue.expected] ?? issue.expected} szükséges.`,
      };

    case z.ZodIssueCode.invalid_enum_value:
    case z.ZodIssueCode.invalid_literal:
    case z.ZodIssueCode.invalid_union_discriminator:
      return { message: 'Érvénytelen választás.' };

    case z.ZodIssueCode.invalid_union:
      return { message: 'Érvénytelen érték.' };

    case z.ZodIssueCode.unrecognized_keys:
      return { message: 'Ismeretlen mező szerepel a kérésben.' };

    case z.ZodIssueCode.too_small:
      if (issue.type === 'string') {
        return issue.minimum === 1
          ? { message: 'Kötelező mező.' }
          : { message: `Legalább ${issue.minimum} karakter.` };
      }
      if (issue.type === 'array') return { message: `Legalább ${issue.minimum} elem szükséges.` };
      return { message: `Legalább ${issue.minimum}.` };

    case z.ZodIssueCode.too_big:
      if (issue.type === 'string') return { message: `Legfeljebb ${issue.maximum} karakter.` };
      if (issue.type === 'array') return { message: `Legfeljebb ${issue.maximum} elem adható meg.` };
      return { message: `Legfeljebb ${issue.maximum}.` };

    case z.ZodIssueCode.not_multiple_of:
      return { message: `${issue.multipleOf} többszöröse legyen.` };

    case z.ZodIssueCode.invalid_string:
      if (issue.validation === 'email') return { message: 'Érvénytelen e-mail-cím.' };
      if (issue.validation === 'url') return { message: 'Érvénytelen URL.' };
      if (issue.validation === 'datetime') return { message: 'Érvénytelen dátum.' };
      return { message: 'Érvénytelen formátum.' };

    case z.ZodIssueCode.invalid_date:
      return { message: 'Érvénytelen dátum.' };

    default:
      // `custom` and `invalid_arguments` always carry a message from the
      // refinement that raised them; falling through keeps it.
      return { message: ctx.defaultError };
  }
});
