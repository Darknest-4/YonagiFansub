import { z } from 'zod';
import {
  AgeRating,
  AnimeSeason,
  ContactCategory,
  ContactStatus,
  EpisodeStatus,
  LinkAvailability,
  LinkKind,
  ProjectStatus,
  ProjectType,
  PublishStatus,
  ReleaseKind,
  Resolution,
  UserStatus,
} from '@prisma/client';
import {
  booleanFlag,
  cuid,
  displayName,
  email,
  hexColor,
  honeypot,
  nullableDate,
  optionalText,
  optionalUrl,
  password,
  percent,
  slug,
  text,
  username,
} from '@/lib/validation/common';
import { paginationSchema } from '@/lib/api/pagination';

/**
 * Request schemas, grouped by domain.
 *
 * Every write endpoint and every list endpoint gets its shape from here. The
 * `*Query` schemas double as the contract for URL search params, which is why
 * they use `coerce` — a query string only ever contains strings.
 */

// ── Auth ─────────────────────────────────────────────────────────────────────

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

// ── Profile ──────────────────────────────────────────────────────────────────

export const updateProfileSchema = z.object({
  displayName,
  bio: optionalText(500),
  avatarUrl: optionalUrl,
});

export const updatePreferencesSchema = z.object({
  notifyNewRelease: z.boolean(),
  notifyNewsPost: z.boolean(),
  notifyCommentReply: z.boolean(),
  emailDigest: z.enum(['off', 'daily', 'weekly']),
  reducedMotion: z.boolean(),
});

// ── Projects ─────────────────────────────────────────────────────────────────

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

// ── Episodes ─────────────────────────────────────────────────────────────────

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

export const episodeQuerySchema = paginationSchema.extend({
  projectId: cuid.optional(),
  status: z.nativeEnum(EpisodeStatus).optional(),
  sort: z.string().max(40).optional(),
});

// ── Releases ─────────────────────────────────────────────────────────────────

export const downloadLinkSchema = z.object({
  id: cuid.optional(),
  hostId: cuid.nullable().optional(),
  kind: z.nativeEnum(LinkKind),
  label: optionalText(80),
  url: z
    .string()
    .trim()
    .min(1, 'Kötelező mező.')
    .max(2048)
    .refine(
      (value) => /^(https?:\/\/|magnet:\?)/i.test(value),
      'Csak http(s) vagy magnet link adható meg.',
    ),
  isMirror: z.boolean().default(false),
  priority: z.coerce.number().int().min(0).max(999).default(0),
  availability: z.nativeEnum(LinkAvailability).default('UNCHECKED'),
});

export const releaseWriteSchema = z.object({
  projectId: cuid,
  episodeId: cuid.nullable().optional(),
  kind: z.nativeEnum(ReleaseKind),
  version: z.coerce.number().int().min(1).max(99).default(1),
  formatId: cuid.nullable().optional(),
  resolution: z.nativeEnum(Resolution),
  videoCodec: optionalText(40),
  audioCodec: optionalText(40),
  subtitleFormat: optionalText(20),
  fileSizeBytes: z
    .union([z.coerce.number().int().min(0), z.literal('')])
    .nullable()
    .optional()
    .transform((value) => (value === '' || value === null || value === undefined ? null : BigInt(value))),
  durationSec: z.coerce.number().int().min(0).max(86_400).nullable().optional(),
  crc32: z
    .string()
    .regex(/^[0-9A-Fa-f]{8}$/, 'A CRC32 8 hexadecimális karakter.')
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  sha256: z
    .string()
    .regex(/^[0-9A-Fa-f]{64}$/, 'A SHA-256 64 hexadecimális karakter.')
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  changelog: optionalText(2000),
  notes: optionalText(2000),
  status: z.nativeEnum(PublishStatus),
  releasedAt: nullableDate,
  links: z.array(downloadLinkSchema).max(24).default([]),
});

export const RELEASE_SORTS = ['releasedAt', 'downloadCount', 'createdAt'] as const;

export const releaseQuerySchema = paginationSchema.extend({
  projectId: cuid.optional(),
  projectSlug: z.string().max(96).optional(),
  resolution: z.nativeEnum(Resolution).optional(),
  kind: z.nativeEnum(ReleaseKind).optional(),
  status: z.nativeEnum(PublishStatus).optional(),
  sort: z.string().max(40).optional(),
});

// ── News ─────────────────────────────────────────────────────────────────────

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

// ── Team ─────────────────────────────────────────────────────────────────────

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

// ── Video ────────────────────────────────────────────────────────────────────

/**
 * A storage key, not a URL.
 *
 * The pattern is deliberately strict: lowercase-ish path segments, no leading
 * slash, no `..`, no scheme. This value is handed to the media driver, so
 * anything that could resolve outside the storage root has to be impossible to
 * express, not merely unlikely.
 */
export const storageKey = z
  .string()
  .trim()
  .min(3, 'Add meg a tárolási kulcsot.')
  .max(512, 'Túl hosszú kulcs.')
  .regex(
    /^(?!\/)(?!.*\.\.)[A-Za-z0-9._\-]+(?:\/[A-Za-z0-9._\-]+)*\.m3u8$/,
    'Egy .m3u8 lejátszási lista kulcsa kell, pl. video/yoru-01/master.m3u8',
  );

export const videoWriteSchema = z.object({
  episodeId: cuid,
  masterKey: storageKey,
  label: optionalText(60),
  resolution: z.enum(['SD_480P', 'HD_720P', 'FHD_1080P', 'QHD_1440P', 'UHD_2160P']),
  durationSec: z.coerce.number().int().min(0).max(86_400).nullish(),
  requiresAuth: z.boolean().default(false),
  status: z.enum(['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED']).default('DRAFT'),
});

// ── Contact ──────────────────────────────────────────────────────────────────

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

// ── Comments ─────────────────────────────────────────────────────────────────

export const commentCreateSchema = z
  .object({
    body: text(2, 2000, 'A hozzászólás'),
    parentId: cuid.nullable().optional(),
    projectId: cuid.nullable().optional(),
    episodeId: cuid.nullable().optional(),
    newsPostId: cuid.nullable().optional(),
  })
  .refine(
    (data) => [data.projectId, data.episodeId, data.newsPostId].filter(Boolean).length === 1,
    { message: 'Pontosan egy célt kell megadni.', path: ['projectId'] },
  );

// ── Users / roles (admin) ────────────────────────────────────────────────────

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

// ── Settings ─────────────────────────────────────────────────────────────────

export const settingsWriteSchema = z.object({
  values: z.record(z.string().max(64), z.unknown()),
});

// ── Search ───────────────────────────────────────────────────────────────────

// ── GYIK ─────────────────────────────────────────────────────────────────────

export const FAQ_CATEGORIES = ['general', 'download', 'projects', 'team', 'technical'] as const;

export const faqWriteSchema = z.object({
  question: text(4, 240, 'A kérdés'),
  answer: text(4, 4000, 'A válasz'),
  category: z.enum(FAQ_CATEGORIES).default('general'),
  // Omitted on create means "put it at the end"; the service resolves it.
  sortOrder: z.coerce.number().int().min(0).max(9999).nullable().optional(),
  isPublished: booleanFlag.default(true),
});

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1, 'Adj meg keresőkifejezést.').max(120),
  limit: z.coerce.number().int().min(1).max(20).default(8),
  type: z.enum(['all', 'project', 'episode', 'news', 'team']).default('all'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ProjectWriteInput = z.infer<typeof projectWriteSchema>;
export type EpisodeWriteInput = z.infer<typeof episodeWriteSchema>;
export type ReleaseWriteInput = z.infer<typeof releaseWriteSchema>;
export type NewsWriteInput = z.infer<typeof newsWriteSchema>;
export type TeamMemberWriteInput = z.infer<typeof teamMemberWriteSchema>;
export type VideoWriteInput = z.infer<typeof videoWriteSchema>;
export type FaqWriteInput = z.infer<typeof faqWriteSchema>;
export type ContactInput = z.infer<typeof contactSchema>;
