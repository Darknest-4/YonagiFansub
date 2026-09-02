import { z } from 'zod';
import {
  booleanFlag,
  displayName,
  email,
  honeypot,
  password,
  username,
} from '@/shared/validation/common';

/**
 * A regisztrációs és jelszókezelő űrlapok alakja.
 *
 * A `website` mező mindenhol csapda: valódi felhasználó sosem tölti ki, mert
 * nem látja. A jelszóismétlés `refine`-ként szerepel és nem külön ellenőrzésként,
 * hogy a hiba arra a mezőre kerüljön, amelyiket javítani kell.
 */

export const registerSchema = z
  .object({
    email,
    username,
    displayName,
    password,
    passwordConfirmation: z.string(),
    acceptTerms: z.literal(true, {
      errorMap: () => ({ message: 'A folytatáshoz el kell fogadnod a feltételeket.' }),
    }),
    website: honeypot,
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: 'A két jelszó nem egyezik.',
    path: ['passwordConfirmation'],
  });

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Kötelező mező.'),
  remember: booleanFlag.optional(),
});

export const forgotPasswordSchema = z.object({ email, website: honeypot });

/** Same shape as the reset request, and for the same reasons — honeypot included. */
export const resendVerificationSchema = z.object({ email, website: honeypot });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(20, 'Érvénytelen token.'),
    password,
    passwordConfirmation: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: 'A két jelszó nem egyezik.',
    path: ['passwordConfirmation'],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Kötelező mező.'),
    password,
    passwordConfirmation: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: 'A két jelszó nem egyezik.',
    path: ['passwordConfirmation'],
  })
  .refine((data) => data.password !== data.currentPassword, {
    message: 'Az új jelszó nem egyezhet meg a régivel.',
    path: ['password'],
  });

export const verifyEmailSchema = z.object({ token: z.string().min(20) });
