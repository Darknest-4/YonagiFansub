import { z } from 'zod';
import { UserStatus } from '@prisma/client';
import {
  cuid,
  displayName,
  hexColor,
  optionalText,
  optionalUrl,
  text,
} from '@/shared/validation/common';
import { paginationSchema } from '@/shared/api/pagination';

/**
 * A fiókhoz tartozó bemenetek — a sajátjától az adminéig.
 *
 * A két oldal szándékosan egy fájlban van: ugyanarról az entitásról szólnak, és
 * a jogosultsági különbséget nem a séma dönti el, hanem a végpont.
 */

// ── A saját fiók ─────────────────────────────────────────────────────────────

export const updateProfileSchema = z.object({
  displayName,
  bio: optionalText(500),
  avatarUrl: optionalUrl,
});

export const updatePreferencesSchema = z.object({
  // A kulcs neve a régi, hogy a már elmentett beállítások érvényben maradjanak;
  // a jelentése „új rész jelent meg”. Lásd `notifyNewEpisode` a szerveroldalon.
  notifyNewRelease: z.boolean(),
  notifyNewsPost: z.boolean(),
  notifyCommentReply: z.boolean(),
  emailDigest: z.enum(['off', 'daily', 'weekly']),
  reducedMotion: z.boolean(),
});

// ── Admin: felhasználók és szerepkörök ───────────────────────────────────────

export const userQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(120).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  role: z.string().max(40).optional(),
  sort: z.string().max(40).optional(),
});

export const userUpdateSchema = z.object({
  displayName,
  status: z.nativeEnum(UserStatus),
  roleId: cuid,
  bio: optionalText(500),
});

export const roleWriteSchema = z.object({
  key: z
    .string()
    .trim()
    .min(2)
    .max(32)
    .regex(/^[a-z][a-z0-9_-]*$/, 'Csak kisbetű, szám, kötőjel és alulvonás.'),
  name: text(2, 48, 'A név'),
  description: optionalText(240),
  rank: z.coerce.number().int().min(1).max(999),
  color: hexColor.nullable().optional(),
  permissionKeys: z.array(z.string().max(64)).max(64).default([]),
});

/*
  A szolgáltatásréteg bemeneti típusai.

  A `z.infer` csak típus, tehát futásidőben nem keletkezik tőle függés a
  sémákra: az admin-szolgáltatás sima adatot vesz át, és ugyanúgy hívható egy
  seed szkriptből vagy egy karbantartó feladatból, mint egy végpontból.
*/
export type UserWriteInput = z.infer<typeof userUpdateSchema>;
export type RoleWriteInput = z.infer<typeof roleWriteSchema>;
