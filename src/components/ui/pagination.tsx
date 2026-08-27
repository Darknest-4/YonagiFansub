'use client';

import Link from 'next/link';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Pagination.
 *
 * Renders real `<a>` elements with real hrefs — pages stay linkable, shareable
 * and crawlable, and middle-click works. The window logic always shows the
 * first and last page plus a window around the current one, so the control has
 * a stable width whether there are 3 pages or 300.
 */

export interface PaginationProps {
  page: number;
  totalPages: number;
  /** Builds the href for a page number, preserving the current filters. */
  buildHref: (page: number) => string;
  /** Total row count – rendered as "1–24 / 312" context text. */
  total?: number;
  perPage?: number;
  className?: string;
}

function buildWindow(page: number, totalPages: number): Array<number | 'gap'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, totalPages, page]);
  for (let offset = 1; offset <= 1; offset += 1) {
    if (page - offset > 1) pages.add(page - offset);
    if (page + offset < totalPages) pages.add(page + offset);
  }
  // Keep the control a constant width near the ends.
  if (page <= 3) [2, 3, 4].forEach((value) => value < totalPages && pages.add(value));
  if (page >= totalPages - 2) {
    [totalPages - 3, totalPages - 2, totalPages - 1].forEach(
      (value) => value > 1 && pages.add(value),
    );
  }

  const sorted = [...pages].filter((value) => value >= 1 && value <= totalPages).sort((a, b) => a - b);

  const result: Array<number | 'gap'> = [];
  let previous = 0;
  for (const value of sorted) {
    if (previous && value - previous > 1) result.push('gap');
    result.push(value);
    previous = value;
  }
  return result;
}

const ITEM_BASE = cn(
  'inline-flex h-10 min-w-10 items-center justify-center rounded-lg px-3 text-sm font-medium',
  'transition-[background-color,color,border-color] duration-fast',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide-400',
);

export function Pagination({
  page,
  totalPages,
  buildHref,
  total,
  perPage,
  className,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const items = buildWindow(page, totalPages);
  const from = perPage ? (page - 1) * perPage + 1 : null;
  const to = perPage && total ? Math.min(page * perPage, total) : null;

  return (
    <nav
      aria-label="Lapozás"
      className={cn('flex flex-col items-center gap-4 sm:flex-row sm:justify-between', className)}
    >
      {total !== undefined && from !== null && (
        <p className="nums order-2 text-xs text-content-muted sm:order-1">
          <span className="text-mist-200">
            {from}–{to}
          </span>{' '}
          / {total} találat
        </p>
      )}

      <ul className="order-1 flex items-center gap-1 sm:order-2">
        <li>
          {page > 1 ? (
            <Link
              href={buildHref(page - 1)}
              rel="prev"
              aria-label="Előző oldal"
              className={cn(ITEM_BASE, 'text-mist-300 hover:bg-ink-800 hover:text-mist-100')}
            >
              <ChevronLeft className="size-4" aria-hidden />
              <span className="ml-1 hidden sm:inline">Előző</span>
            </Link>
          ) : (
            <span
              aria-disabled="true"
              className={cn(ITEM_BASE, 'cursor-not-allowed text-mist-600')}
            >
              <ChevronLeft className="size-4" aria-hidden />
              <span className="ml-1 hidden sm:inline">Előző</span>
            </span>
          )}
        </li>

        {items.map((item, index) =>
          item === 'gap' ? (
            <li key={`gap-${index}`} className="hidden xs:block">
              <span className="inline-flex h-10 w-8 items-center justify-center text-mist-600">
                <MoreHorizontal className="size-4" aria-hidden />
                <span className="sr-only">kihagyott oldalak</span>
              </span>
            </li>
          ) : (
            <li key={item} className={cn(item !== page && 'hidden xs:block')}>
              <Link
                href={buildHref(item)}
                aria-current={item === page ? 'page' : undefined}
                aria-label={`${item}. oldal`}
                className={cn(
                  ITEM_BASE,
                  'nums',
                  item === page
                    ? 'bg-tide-400/15 text-tide-200 ring-1 ring-tide-400/40'
                    : 'text-mist-300 hover:bg-ink-800 hover:text-mist-100',
                )}
              >
                {item}
              </Link>
            </li>
          ),
        )}

        {/* Compact indicator for the narrowest viewports. */}
        <li className="nums px-2 text-sm text-mist-400 xs:hidden">/ {totalPages}</li>

        <li>
          {page < totalPages ? (
            <Link
              href={buildHref(page + 1)}
              rel="next"
              aria-label="Következő oldal"
              className={cn(ITEM_BASE, 'text-mist-300 hover:bg-ink-800 hover:text-mist-100')}
            >
              <span className="mr-1 hidden sm:inline">Következő</span>
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          ) : (
            <span
              aria-disabled="true"
              className={cn(ITEM_BASE, 'cursor-not-allowed text-mist-600')}
            >
              <span className="mr-1 hidden sm:inline">Következő</span>
              <ChevronRight className="size-4" aria-hidden />
            </span>
          )}
        </li>
      </ul>
    </nav>
  );
}
