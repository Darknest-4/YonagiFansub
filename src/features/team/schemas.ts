import { z } from 'zod';
import {
  cuid,
  hexColor,
  nullableDate,
  optionalText,
  optionalUrl,
  slug,
  text,
} from '@/shared/validation/common';

export const teamMemberWriteSchema = z.object({
  slug,
  userId: cuid.nullable().optional(),
  name: text(2, 60, 'A név'),
  tagline: optionalText(160),
  bio: optionalText(3000),
  avatarUrl: optionalUrl,
  bannerUrl: optionalUrl,
  accentColor: hexColor.nullable().optional(),
  socials: z
    .object({
      discord: optionalText(80),
      x: optionalText(80),
      anilist: optionalText(120),
      myanimelist: optionalText(120),
      website: optionalUrl,
    })
    .partial()
    .default({}),
  joinedAt: nullableDate,
  leftAt: nullableDate,
  isActive: z.boolean().default(true),
  isFounder: z.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  positionIds: z.array(cuid).max(12).default([]),
});

export type TeamMemberWriteInput = z.infer<typeof teamMemberWriteSchema>;
