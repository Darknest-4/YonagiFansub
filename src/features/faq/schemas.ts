import { z } from 'zod';
import { booleanFlag, text } from '@/shared/validation/common';

export const FAQ_CATEGORIES = ['general', 'download', 'projects', 'team', 'technical'] as const;

export const faqWriteSchema = z.object({
  question: text(4, 240, 'A kérdés'),
  answer: text(4, 4000, 'A válasz'),
  category: z.enum(FAQ_CATEGORIES).default('general'),
  // Omitted on create means "put it at the end"; the service resolves it.
  sortOrder: z.coerce.number().int().min(0).max(9999).nullable().optional(),
  isPublished: booleanFlag.default(true),
});

export type FaqWriteInput = z.infer<typeof faqWriteSchema>;
