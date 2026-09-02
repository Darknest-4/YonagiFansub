import type {
  AgeRating,
  AnimeSeason,
  ProjectStatus,
  ProjectType,
  PublishStatus,
} from '@prisma/client';

/**
 * Admin form shapes and their blank values.
 *
 * These live in a module with **no `'use client'` directive** on purpose.
 *
 * Anything exported from a client module and referenced by a server component
 * becomes a *client reference* — an opaque marker, not the value. Passing one
 * straight through as a prop happens to work (React resolves it on the client),
 * but the moment the server actually reads it — spreading it to override a
 * field, say — it produces an unusable object and fails at render time.
 *
 * Keeping the defaults here means both sides get the real object, and the
 * server can build an initial state from them freely.
 *
 * All fields are strings because they are bound to form inputs; the API schemas
 * do the coercion back to numbers, dates and enums.
 */

// ── Project ──────────────────────────────────────────────────────────────────

export interface ProjectFormValues {
  slug: string;
  title: string;
  titleRomaji: string;
  titleNative: string;
  titleEnglish: string;
  synonyms: string;
  synopsis: string;
  type: ProjectType;
  status: ProjectStatus;
  publishStatus: PublishStatus;
  season: AnimeSeason | '';
  seasonYear: string;
  totalEpisodes: string;
  ageRating: AgeRating | '';
  studio: string;
  source: string;
  durationMin: string;
  coverImageUrl: string;
  bannerImageUrl: string;
  trailerUrl: string;
  accentColor: string;
  malId: string;
  anilistId: string;
  isFeatured: boolean;
  genreIds: string[];
}

export const EMPTY_PROJECT: ProjectFormValues = {
  slug: '',
  title: '',
  titleRomaji: '',
  titleNative: '',
  titleEnglish: '',
  synonyms: '',
  synopsis: '',
  type: 'TV',
  status: 'ANNOUNCED',
  publishStatus: 'DRAFT',
  season: '',
  seasonYear: '',
  totalEpisodes: '',
  ageRating: '',
  studio: '',
  source: '',
  durationMin: '',
  coverImageUrl: '',
  bannerImageUrl: '',
  trailerUrl: '',
  accentColor: '',
  malId: '',
  anilistId: '',
  isFeatured: false,
  genreIds: [],
};

// ── News ─────────────────────────────────────────────────────────────────────

export interface NewsFormValues {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  coverImageUrl: string;
  categoryId: string;
  status: PublishStatus;
  publishedAt: string;
  isPinned: boolean;
}

export const EMPTY_NEWS: NewsFormValues = {
  slug: '',
  title: '',
  excerpt: '',
  content: '',
  coverImageUrl: '',
  categoryId: '',
  status: 'DRAFT',
  publishedAt: '',
  isPinned: false,
};

/**
 * `datetime-local` expects `YYYY-MM-DDTHH:mm` in the *viewer's* local time, not
 * an ISO string. Shared by every editor that has a scheduling field.
 */
export function toLocalDateTimeValue(date: Date | null | undefined): string {
  if (!date) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
