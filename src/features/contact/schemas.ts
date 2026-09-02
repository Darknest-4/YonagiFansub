import { z } from 'zod';
import { ContactCategory, ContactStatus } from '@prisma/client';
import { email, honeypot, optionalText, text } from '@/shared/validation/common';
import { paginationSchema } from '@/shared/api/pagination';

export const contactSchema = z.object({
  name: text(2, 80, 'A név'),
  email,
  subject: text(3, 160, 'A tárgy'),
  body: text(20, 5000, 'Az üzenet'),
  category: z.nativeEnum(ContactCategory).default('GENERAL'),
  acceptPrivacy: z.literal(true, {
    errorMap: () => ({ message: 'Az adatkezelés elfogadása kötelező.' }),
  }),
  website: honeypot,
});

export const contactUpdateSchema = z.object({
  status: z.nativeEnum(ContactStatus),
  internalNote: optionalText(4000),
});

export const contactQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(ContactStatus).optional(),
  category: z.nativeEnum(ContactCategory).optional(),
  q: z.string().trim().max(120).optional(),
});
