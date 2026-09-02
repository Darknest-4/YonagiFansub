'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Input } from '@/shared/ui/field';
import { Pagination } from '@/shared/ui/pagination';
import { Checkbox } from '@/shared/ui/field';

/**
 * Admin data table.
 *
 * Two things make this more than a styled `<table>`:
 *
 *   1. **It is a real table on desktop and real cards on mobile.** A horizontally
 *      scrolling table on a phone is unusable; the same rows are rendered as a
 *      stacked card list below `md`, driven by the same column definitions, so
 *      there is only one place to add a field.
 *   2. **Selection drives a bulk-action bar** that appears only when something is
 *      selected, with the count spelled out — bulk operations on an unclear
 *      selection are how people delete the wrong twenty rows.
 *
 * Sorting and paging are URL state, so an admin can bookmark or share a view.
 */

export interface Column<T> {
  key: string;
  header: string;
  /** Sortable columns must match a key the API's `parseSort` allow-list accepts. */
  sortable?: boolean;
  align?: 'left' | 'right';
  width?: string;
  /** Hidden on the mobile card layout – use for low-value metadata. */
  secondary?: boolean;
  render: (row: T) => ReactNode;
}

export interface DataTableProps<T extends { id: string }> {
  rows: T[];
  columns: Column<T>[];
  /** Link target for the row; makes the whole row navigable. */
  rowHref?: (row: T) => string;
  meta?: { page?: number; totalPages?: number; total?: number; perPage?: number };
  basePath: string;
  searchPlaceholder?: string;
  bulkActions?: (selected: string[], clear: () => void) => ReactNode;
  emptyState: ReactNode;
  toolbar?: ReactNode;
}

export function DataTable<T extends { id: string }>({
  rows,
  columns,
  rowHref,
  meta,
  basePath,
  searchPlaceholder = 'Keresés…',
  bulkActions,
  emptyState,
  toolbar,
}: DataTableProps<T>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState(searchParams.get('q') ?? '');

  const currentSort = searchParams.get('sort') ?? '';

  const pushParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    if (!('page' in updates)) next.delete('page');

    startTransition(() => {
      router.push(`${basePath}${next.toString() ? `?${next}` : ''}`, { scroll: false });
    });
  };

  const toggleSort = (key: string) => {
    // asc → desc → off, so a third click clears the sort instead of trapping it.
    const nextSort =
      currentSort === key ? `-${key}` : currentSort === `-${key}` ? null : key;
    pushParams({ sort: nextSort });
  };

  const buildHref = (page: number) => {
    const next = new URLSearchParams(searchParams.toString());
    if (page > 1) next.set('page', String(page));
    else next.delete('page');
    return `${basePath}${next.toString() ? `?${next}` : ''}`;
  };

  const allSelected = rows.length > 0 && selected.length === rows.length;
  const clearSelection = () => setSelected([]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <form
          className="min-w-0 flex-1 sm:max-w-xs"
          onSubmit={(event) => {
            event.preventDefault();
            pushParams({ q: query || null });
          }}
        >
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onBlur={() => {
              if ((searchParams.get('q') ?? '') !== query) pushParams({ q: query || null });
            }}
            type="search"
            inputSize="sm"
            aria-label="Keresés a listában"
            placeholder={searchPlaceholder}
            leadingIcon={<Search className="size-4" aria-hidden />}
          />
        </form>

        {toolbar}

        {meta?.total !== undefined && (
          <p className="nums ml-auto text-xs text-mist-500" aria-live="polite">
            {meta.total} találat
          </p>
        )}
      </div>

      {bulkActions && selected.length > 0 && (
        <div
          role="region"
          aria-label="Tömeges műveletek"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-bloom-400/30 bg-bloom-400/8 px-4 py-3"
        >
          <p className="nums text-sm font-medium text-bloom-200">
            {selected.length} kijelölve
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {bulkActions(selected, clearSelection)}
          </div>
          <button
            type="button"
            onClick={clearSelection}
            className="ml-auto text-xs text-mist-400 underline-offset-4 hover:text-mist-200 hover:underline"
          >
            Kijelölés törlése
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        emptyState
      ) : (
        <div className={cn('transition-opacity duration-fast', pending && 'opacity-60')}>
          {/* Desktop: real table semantics. */}
          <div className="hidden overflow-hidden rounded-xl border border-ink-800 md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-800 bg-ink-900">
                  {bulkActions && (
                    <th scope="col" className="w-10 px-3 py-2.5">
                      <Checkbox
                        checked={allSelected}
                        onChange={() => setSelected(allSelected ? [] : rows.map((row) => row.id))}
                        label={<span className="sr-only">Összes kijelölése</span>}
                      />
                    </th>
                  )}

                  {columns.map((column) => (
                    <th
                      key={column.key}
                      scope="col"
                      style={column.width ? { width: column.width } : undefined}
                      className={cn(
                        'px-4 py-2.5 text-2xs font-semibold tracking-wide text-mist-500 uppercase',
                        column.align === 'right' ? 'text-right' : 'text-left',
                      )}
                    >
                      {column.sortable ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(column.key)}
                          className="inline-flex items-center gap-1.5 transition-colors hover:text-mist-200"
                          aria-label={`Rendezés: ${column.header}`}
                        >
                          {column.header}
                          {currentSort === column.key ? (
                            <ArrowUp className="size-3" aria-hidden />
                          ) : currentSort === `-${column.key}` ? (
                            <ArrowDown className="size-3" aria-hidden />
                          ) : (
                            <ArrowUpDown className="size-3 opacity-40" aria-hidden />
                          )}
                        </button>
                      ) : (
                        column.header
                      )}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-ink-850">
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      'bg-ink-900/40 transition-colors hover:bg-ink-850',
                      selected.includes(row.id) && 'bg-bloom-400/[0.06]',
                    )}
                  >
                    {bulkActions && (
                      <td className="px-3 py-2.5">
                        <Checkbox
                          checked={selected.includes(row.id)}
                          onChange={() =>
                            setSelected((current) =>
                              current.includes(row.id)
                                ? current.filter((id) => id !== row.id)
                                : [...current, row.id],
                            )
                          }
                          label={<span className="sr-only">Sor kijelölése</span>}
                        />
                      </td>
                    )}

                    {columns.map((column, index) => (
                      <td
                        key={column.key}
                        className={cn(
                          'px-4 py-3 align-middle',
                          column.align === 'right' ? 'text-right' : 'text-left',
                        )}
                      >
                        {index === 0 && rowHref ? (
                          <Link
                            href={rowHref(row)}
                            className="block font-medium text-mist-100 transition-colors hover:text-bloom-200"
                          >
                            {column.render(row)}
                          </Link>
                        ) : (
                          column.render(row)
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: the same data as cards. */}
          <ul className="space-y-2.5 md:hidden">
            {rows.map((row) => {
              const [primary, ...rest] = columns;

              return (
                <li
                  key={row.id}
                  className="rounded-xl border border-ink-800 bg-ink-900/50 p-4"
                >
                  <div className="flex items-start gap-3">
                    {bulkActions && (
                      <Checkbox
                        checked={selected.includes(row.id)}
                        onChange={() =>
                          setSelected((current) =>
                            current.includes(row.id)
                              ? current.filter((id) => id !== row.id)
                              : [...current, row.id],
                          )
                        }
                        label={<span className="sr-only">Sor kijelölése</span>}
                      />
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-mist-100">
                        {primary &&
                          (rowHref ? (
                            <Link href={rowHref(row)} className="hover:text-bloom-200">
                              {primary.render(row)}
                            </Link>
                          ) : (
                            primary.render(row)
                          ))}
                      </div>

                      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                        {rest
                          .filter((column) => !column.secondary)
                          .map((column) => (
                            <div key={column.key} className="min-w-0">
                              <dt className="text-[10px] tracking-wide text-mist-600 uppercase">
                                {column.header}
                              </dt>
                              <dd className="mt-0.5 truncate text-xs text-mist-300">
                                {column.render(row)}
                              </dd>
                            </div>
                          ))}
                      </dl>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {meta && (
        <Pagination
          page={meta.page ?? 1}
          totalPages={meta.totalPages ?? 1}
          total={meta.total}
          perPage={meta.perPage}
          buildHref={buildHref}
        />
      )}
    </div>
  );
}
