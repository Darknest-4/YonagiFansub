import { z } from 'zod';
import { PublishStatus } from '@prisma/client';
import { cuid, nullableDate, optionalText, optionalUrl, slug, text } from '@/shared/validation/common';
import { paginationSchema } from '@/shared/api/pagination';

export const newsWriteSchema = z.object({
  slug,
  title: text(1, 180, 'A cím'),
  excerpt: optionalText(320),
  content: text(1, 60_000, 'A tartalom'),
  coverImageUrl: optionalUrl,
  categoryId: cuid.nullable().optional(),
  status: z.nativeEnum(PublishStatus),
  publishedAt: nullableDate,
  isPinned: z.boolean().default(false),
});

export const newsQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(120).optional(),
  category: z.string().max(96).optional(),
  status: z.nativeEnum(PublishStatus).optional(),
});

export type NewsWriteInput = z.infer<typeof newsWriteSchema>;
