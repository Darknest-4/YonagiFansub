import { z } from 'zod';
import '@/lib/validation/error-map';
import type { ApiMeta } from '@/lib/api/response';

/**
 * Uniform pagination, sorting and filtering primitives.
 *
 * Every list endpoint accepts the same query shape, which keeps the client-side
 * data hooks generic and makes the API predictable:
 *   `?page=2&perPage=24&sort=-releasedAt&q=steins`
 */

export const DEFAULT_PER_PAGE = 24;
export const MAX_PER_PAGE = 100;

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  perPage: z.coerce.number().int().min(1).max(MAX_PER_PAGE).default(DEFAULT_PER_PAGE),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

export function toSkipTake({ page, perPage }: PaginationInput) {
  return { skip: (page - 1) * perPage, take: perPage };
}

export function paginationMeta(total: number, { page, perPage }: PaginationInput): ApiMeta {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  return {
    page,
    perPage,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1,
  };
}

/**
 * Sort parser with an allow-list.
 *
 * `-field` means descending. Passing the allow-list is mandatory: an
 * unvalidated sort key reaches Prisma's `orderBy` and is an injection vector
 * for ordering by columns that should not be exposed.
 */
export function parseSort<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
  fallback: { field: T; direction: 'asc' | 'desc' },
): { field: T; direction: 'asc' | 'desc' } {
  if (!value) return fallback;

  const direction = value.startsWith('-') ? 'desc' : 'asc';
  const field = value.replace(/^[-+]/, '') as T;

  return allowed.includes(field) ? { field, direction } : fallback;
}

/** Turns a parsed sort into Prisma's `orderBy`, supporting `a.b` nested paths. */
export function toOrderBy(sort: { field: string; direction: 'asc' | 'desc' }) {
  const path = sort.field.split('.');
  return path.reduceRight<Record<string, unknown>>(
    (accumulator, key, index) =>
      index === path.length - 1 ? { [key]: sort.direction } : { [key]: accumulator },
    {},
  );
}

/** Normalises a free-text query: trimmed, collapsed, length-capped. */
export function normaliseQuery(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(/\s+/g, ' ').trim().slice(0, 120);
  return cleaned.length >= 2 ? cleaned : undefined;
}

/** Comma-separated multi-value filter (`?genre=action,drama`), de-duplicated. */
export function parseList(value: string | null | undefined, max = 20): string[] {
  if (!value) return [];
  return [
    ...new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ].slice(0, max);
}

/** Cursor helpers for the infinite-scroll endpoints (comments). */
export const cursorSchema = z.object({
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type CursorInput = z.infer<typeof cursorSchema>;

export function cursorMeta<T extends { id: string }>(
  items: T[],
  limit: number,
): { items: T[]; meta: ApiMeta } {
  const hasNext = items.length > limit;
  const page = hasNext ? items.slice(0, limit) : items;
  return {
    items: page,
    meta: { hasNext, nextCursor: hasNext ? page[page.length - 1]?.id : null },
  };
}
