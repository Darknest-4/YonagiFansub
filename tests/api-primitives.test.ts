import { describe, expect, it } from 'vitest';
import {
  cursorMeta,
  normaliseQuery,
  paginationMeta,
  paginationSchema,
  parseList,
  parseSort,
  toOrderBy,
  toSkipTake,
} from '@/lib/api/pagination';
import {
  AppError,
  ConflictError,
  NotFoundError,
  RateLimitError,
  toAppError,
} from '@/lib/errors';
import { formatBytes, formatEpisodeNumber, safeRedirectPath, slugify, truncate } from '@/lib/utils';

describe('pagination', () => {
  it('applies defaults and clamps out-of-range input', () => {
    expect(paginationSchema.parse({})).toEqual({ page: 1, perPage: 24 });
    expect(paginationSchema.parse({ page: '3', perPage: '10' })).toEqual({ page: 3, perPage: 10 });
    // Beyond the cap, the schema rejects rather than silently serving 10 000 rows.
    expect(paginationSchema.safeParse({ perPage: '5000' }).success).toBe(false);
    expect(paginationSchema.safeParse({ page: '0' }).success).toBe(false);
  });

  it('converts a page into skip/take', () => {
    expect(toSkipTake({ page: 1, perPage: 20 })).toEqual({ skip: 0, take: 20 });
    expect(toSkipTake({ page: 4, perPage: 25 })).toEqual({ skip: 75, take: 25 });
  });

  it('reports navigable boundaries', () => {
    const meta = paginationMeta(57, { page: 2, perPage: 25 });
    expect(meta).toMatchObject({
      page: 2,
      perPage: 25,
      total: 57,
      totalPages: 3,
      hasNext: true,
      hasPrevious: true,
    });

    // An empty result set still has one (empty) page, not zero.
    expect(paginationMeta(0, { page: 1, perPage: 25 })).toMatchObject({
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
    });
  });
});

describe('parseSort', () => {
  const allowed = ['title', 'publishedAt'] as const;
  const fallback = { field: 'publishedAt' as const, direction: 'desc' as const };

  it('parses direction from the leading sign', () => {
    expect(parseSort('title', allowed, fallback)).toEqual({ field: 'title', direction: 'asc' });
    expect(parseSort('-title', allowed, fallback)).toEqual({ field: 'title', direction: 'desc' });
  });

  it('falls back for anything not on the allow-list', () => {
    // This is the injection guard: an arbitrary column must never reach orderBy.
    expect(parseSort('passwordHash', allowed, fallback)).toEqual(fallback);
    expect(parseSort('-user.email', allowed, fallback)).toEqual(fallback);
    expect(parseSort(undefined, allowed, fallback)).toEqual(fallback);
    expect(parseSort('', allowed, fallback)).toEqual(fallback);
  });

  it('builds nested orderBy objects from dotted paths', () => {
    expect(toOrderBy({ field: 'title', direction: 'asc' })).toEqual({ title: 'asc' });
    expect(toOrderBy({ field: 'project.title', direction: 'desc' })).toEqual({
      project: { title: 'desc' },
    });
  });
});

describe('query helpers', () => {
  it('normalises free-text queries and rejects one-character noise', () => {
    expect(normaliseQuery('  steins   gate  ')).toBe('steins gate');
    expect(normaliseQuery('a')).toBeUndefined();
    expect(normaliseQuery('')).toBeUndefined();
    expect(normaliseQuery('x'.repeat(500))?.length).toBe(120);
  });

  it('parses and de-duplicates comma lists', () => {
    expect(parseList('akcio, dráma ,akcio')).toEqual(['akcio', 'dráma']);
    expect(parseList('')).toEqual([]);
    expect(parseList(undefined)).toEqual([]);
    expect(parseList(Array.from({ length: 50 }, (_, i) => `g${i}`).join(',')).length).toBe(20);
  });

  it('detects the extra row that signals another cursor page', () => {
    const rows = Array.from({ length: 6 }, (_, index) => ({ id: `id-${index}` }));
    const result = cursorMeta(rows, 5);

    expect(result.items).toHaveLength(5);
    expect(result.meta.hasNext).toBe(true);
    expect(result.meta.nextCursor).toBe('id-4');

    const exact = cursorMeta(rows.slice(0, 5), 5);
    expect(exact.meta.hasNext).toBe(false);
    expect(exact.meta.nextCursor).toBeNull();
  });
});

describe('error mapping', () => {
  it('passes AppErrors through unchanged', () => {
    const error = new NotFoundError('A projekt');
    expect(toAppError(error)).toBe(error);
    expect(error.status).toBe(404);
    expect(error.expose).toBe(true);
  });

  it('maps Prisma unique-constraint violations to a conflict', () => {
    const mapped = toAppError({ code: 'P2002', meta: { target: ['slug'] } });
    expect(mapped).toBeInstanceOf(ConflictError);
    expect(mapped.status).toBe(409);
    expect(mapped.message).toContain('slug');
  });

  it('maps a missing record to 404', () => {
    expect(toAppError({ code: 'P2025', meta: { modelName: 'Project' } }).status).toBe(404);
  });

  it('wraps unknown failures without exposing their message', () => {
    const mapped = toAppError(new Error('connection string: postgres://user:hunter2@db'));
    expect(mapped.status).toBe(500);
    expect(mapped.expose).toBe(false);
  });

  it('carries a retry hint on rate limits', () => {
    const error = new RateLimitError(42);
    expect(error.status).toBe(429);
    expect(error.retryAfterSeconds).toBe(42);
    expect(error).toBeInstanceOf(AppError);
  });
});

describe('utils', () => {
  it('slugifies Hungarian text', () => {
    expect(slugify('Tőrőlmetszett Ámbár!')).toBe('torolmetszett-ambar');
    expect(slugify('  Több   szóköz  ')).toBe('tobb-szokoz');
    expect(slugify('夜の雫')).toBe('');
  });

  it('formats byte sizes, including BigInt values above 2 GB', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1_395_864_371)).toBe('1.3 GB');
    expect(formatBytes(3_000_000_000n)).toBe('2.79 GB');
    expect(formatBytes(null)).toBe('—');
  });

  it('formats episode numbers without trailing zeros', () => {
    expect(formatEpisodeNumber(12)).toBe('12');
    expect(formatEpisodeNumber('12.00')).toBe('12');
    expect(formatEpisodeNumber('12.50')).toBe('12.5');
  });

  it('truncates on a word boundary', () => {
    expect(truncate('rövid', 20)).toBe('rövid');
    expect(truncate('egy kicsit hosszabb mondat itt', 15)).toBe('egy kicsit…');
  });

  it('blocks open redirects', () => {
    // The whole point: only same-origin relative paths survive.
    expect(safeRedirectPath('/projektek')).toBe('/projektek');
    expect(safeRedirectPath('//evil.example')).toBe('/');
    expect(safeRedirectPath('https://evil.example')).toBe('/');
    expect(safeRedirectPath('/path\\with\\backslash')).toBe('/');
    expect(safeRedirectPath(null)).toBe('/');
    expect(safeRedirectPath(undefined, '/fallback')).toBe('/fallback');
  });
});
