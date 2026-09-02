import { z } from 'zod';
import {
  AgeRating,
  AnimeSeason,
  EpisodeStatus,
  ProjectStatus,
  ProjectType,
  PublishStatus,
} from '@prisma/client';
import {
  cuid,
  hexColor,
  nullableDate,
  optionalText,
  optionalUrl,
  percent,
  slug,
  text,
} from '@/shared/validation/common';
import { paginationSchema } from '@/shared/api/pagination';

/**
 * Projekt és epizód bemenetei.
 *
 * A kettő egy fájlban van, mert egy domain: az epizódnak nincs élete a projekten
 * kívül, és az írási végpontok is együtt kezelik őket.
 *
 * A `*QuerySchema`-k egyben az URL keresőparaméterek szerződései is — ezért
 * használnak `coerce`-öt: a query stringben minden szöveg.
 */

// ── Projekt ──────────────────────────────────────────────────────────────────

export const PROJECT_SORTS = [
  'publishedAt',
  'updatedAt',
  'title',
  'seasonYear',
  'viewCount',
] as const;

export const projectQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(120).optional(),
  status: z.nativeEnum(ProjectStatus).optional(),
  type: z.nativeEnum(ProjectType).optional(),
  genre: z.string().max(200).optional(),
  season: z.nativeEnum(AnimeSeason).optional(),
  year: z.coerce.number().int().min(1960).max(2100).optional(),
  featured: z.enum(['true', 'false']).optional(),
  sort: z.string().max(40).optional(),
});

export const projectWriteSchema = z.object({
  slug,
  title: text(1, 160, 'A cím'),
  titleRomaji: optionalText(160),
  titleNative: optionalText(160),
  titleEnglish: optionalText(160),
  synonyms: z.array(z.string().trim().min(1).max(120)).max(12).default([]),
  synopsis: optionalText(4000),
  type: z.nativeEnum(ProjectType),
  status: z.nativeEnum(ProjectStatus),
  publishStatus: z.nativeEnum(PublishStatus),
  season: z.nativeEnum(AnimeSeason).nullable().optional(),
  seasonYear: z.coerce.number().int().min(1960).max(2100).nullable().optional(),
  totalEpisodes: z.coerce.number().int().min(1).max(9999).nullable().optional(),
  ageRating: z.nativeEnum(AgeRating).nullable().optional(),
  studio: optionalText(120),
  source: optionalText(120),
  durationMin: z.coerce.number().int().min(1).max(600).nullable().optional(),
  coverImageUrl: optionalUrl,
  bannerImageUrl: optionalUrl,
  trailerUrl: optionalUrl,
  accentColor: hexColor.nullable().optional(),
  malId: z.coerce.number().int().positive().nullable().optional(),
  anilistId: z.coerce.number().int().positive().nullable().optional(),
  isFeatured: z.boolean().default(false),
  publishedAt: nullableDate,
  genreIds: z.array(cuid).max(20).default([]),
});

// ── Epizód ───────────────────────────────────────────────────────────────────

export const episodeWriteSchema = z.object({
  projectId: cuid,
  number: z.coerce
    .number()
    .min(0, 'Nem lehet negatív.')
    .max(9999)
    .refine((value) => Number.isFinite(value), 'Érvénytelen szám.'),
  title: optionalText(200),
  titleNative: optionalText(200),
  synopsis: optionalText(2000),
  thumbnailUrl: optionalUrl,
  durationSec: z.coerce.number().int().min(0).max(86_400).nullable().optional(),
  airedAt: nullableDate,
  status: z.nativeEnum(EpisodeStatus),
  progressTranslation: percent.default(0),
  progressTiming: percent.default(0),
  progressTypesetting: percent.default(0),
  progressEditing: percent.default(0),
  progressEncoding: percent.default(0),
  progressQc: percent.default(0),
});

export type ProjectWriteInput = z.infer<typeof projectWriteSchema>;
export type EpisodeWriteInput = z.infer<typeof episodeWriteSchema>;
