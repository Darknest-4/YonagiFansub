'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { Filter, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { PROJECT_STATUS, PROJECT_TYPE_LABEL, SEASON_LABEL } from '@/components/ui/badge';

/**
 * Catalogue filter bar.
 *
 * State lives in the URL, not in React. That means every filtered view is
 * linkable, shareable, back-button-correct and server-rendered — and the
 * component itself stays stateless apart from the debounced search input.
 *
 * `useTransition` keeps the current results on screen and dims them while the
 * new ones load, instead of flashing an empty grid on every keystroke.
 */

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

export function ProjectFilters({
  genres,
  seasons,
}: {
  genres: FilterOption[];
  seasons: Array<{ season: string; seasonYear: number }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [expanded, setExpanded] = useState(false);

  const apply = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '') next.delete(key);
        else next.set(key, value);
      }

      // Any filter change resets to page 1 — staying on page 7 of a result set
      // that now has two pages is a classic dead end.
      next.delete('page');

      startTransition(() => {
        router.push(`/projektek${next.toString() ? `?${next}` : ''}`, { scroll: false });
      });
    },
    [router, searchParams],
  );

  // Debounce the free-text search so typing does not fire a request per keystroke.
  useEffect(() => {
    const current = searchParams.get('q') ?? '';
    if (query === current) return;

    const timer = setTimeout(() => apply({ q: query || null }), 350);
    return () => clearTimeout(timer);
  }, [query, searchParams, apply]);

  const activeFilters = ['status', 'type', 'genre', 'season', 'year', 'sort'].filter((key) =>
    searchParams.has(key),
  );
  const hasActive = activeFilters.length > 0 || Boolean(searchParams.get('q'));

  const years = [...new Set(seasons.map((entry) => entry.seasonYear))].sort((a, b) => b - a);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 sm:max-w-sm">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            type="search"
            placeholder="Cím, stúdió vagy alternatív cím…"
            aria-label="Keresés a projektek között"
            leadingIcon={<Search className="size-4" aria-hidden />}
          />
        </div>

        <Button
          variant={expanded ? 'outline' : 'secondary'}
          size="md"
          onClick={() => setExpanded((value) => !value)}
          leadingIcon={<Filter className="size-4" aria-hidden />}
          aria-expanded={expanded}
          aria-controls="project-filter-panel"
          className="lg:hidden"
        >
          Szűrők
          {activeFilters.length > 0 && (
            <span className="nums ml-1 rounded-full bg-tide-400 px-1.5 text-[10px] font-bold text-ink-950">
              {activeFilters.length}
            </span>
          )}
        </Button>

      </div>

      <div
        id="project-filter-panel"
        className={cn(
          'grid gap-3 sm:grid-cols-2 lg:grid-cols-5',
          !expanded && 'hidden lg:grid',
        )}
      >
        <Select
          value={searchParams.get('status') ?? ''}
          onChange={(event) => apply({ status: event.target.value || null })}
          aria-label="Állapot szerinti szűrés"
        >
          <option value="">Minden állapot</option>
          {Object.entries(PROJECT_STATUS).map(([value, config]) => (
            <option key={value} value={value}>
              {config.label}
            </option>
          ))}
        </Select>

        <Select
          value={searchParams.get('type') ?? ''}
          onChange={(event) => apply({ type: event.target.value || null })}
          aria-label="Típus szerinti szűrés"
        >
          <option value="">Minden típus</option>
          {Object.entries(PROJECT_TYPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>

        <Select
          value={searchParams.get('genre') ?? ''}
          onChange={(event) => apply({ genre: event.target.value || null })}
          aria-label="Műfaj szerinti szűrés"
        >
          <option value="">Minden műfaj</option>
          {genres.map((genre) => (
            <option key={genre.value} value={genre.value}>
              {genre.label}
              {genre.count !== undefined ? ` (${genre.count})` : ''}
            </option>
          ))}
        </Select>

        <Select
          value={searchParams.get('year') ?? ''}
          onChange={(event) => apply({ year: event.target.value || null })}
          aria-label="Évad szerinti szűrés"
        >
          <option value="">Minden évad</option>
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </Select>

        <Select
          value={searchParams.get('sort') ?? '-publishedAt'}
          onChange={(event) => apply({ sort: event.target.value })}
          aria-label="Rendezés"
        >
          <option value="-publishedAt">Legújabb elöl</option>
          <option value="publishedAt">Legrégebbi elöl</option>
          <option value="title">Cím (A–Z)</option>
          <option value="-title">Cím (Z–A)</option>
          <option value="-viewCount">Legnépszerűbb</option>
          <option value="-updatedAt">Legutóbb frissítve</option>
        </Select>
      </div>

      {hasActive && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-2xs tracking-wide text-mist-500 uppercase">Aktív szűrők:</span>

          {searchParams.get('q') && (
            <FilterChip label={`„${searchParams.get('q')}”`} onRemove={() => setQuery('')} />
          )}

          {searchParams.get('status') && (
            <FilterChip
              label={PROJECT_STATUS[searchParams.get('status') as keyof typeof PROJECT_STATUS]?.label ?? ''}
              onRemove={() => apply({ status: null })}
            />
          )}

          {searchParams.get('type') && (
            <FilterChip
              label={PROJECT_TYPE_LABEL[searchParams.get('type')!] ?? ''}
              onRemove={() => apply({ type: null })}
            />
          )}

          {searchParams.get('genre') && (
            <FilterChip
              label={
                genres.find((genre) => genre.value === searchParams.get('genre'))?.label ??
                searchParams.get('genre')!
              }
              onRemove={() => apply({ genre: null })}
            />
          )}

          {searchParams.get('season') && (
            <FilterChip
              label={SEASON_LABEL[searchParams.get('season')!] ?? ''}
              onRemove={() => apply({ season: null })}
            />
          )}

          {searchParams.get('year') && (
            <FilterChip label={searchParams.get('year')!} onRemove={() => apply({ year: null })} />
          )}

          <button
            type="button"
            onClick={() => {
              setQuery('');
              startTransition(() => router.push('/projektek', { scroll: false }));
            }}
            className="text-2xs text-mist-500 underline-offset-4 transition-colors hover:text-danger-400 hover:underline"
          >
            Összes törlése
          </button>
        </div>
      )}

      {pending && (
        <p className="sr-only" role="status">
          Eredmények frissítése…
        </p>
      )}
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-tide-400/30 bg-tide-400/10 py-1 pr-1.5 pl-2.5 text-2xs text-tide-200">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`${label} szűrő eltávolítása`}
        className="rounded-full p-0.5 transition-colors hover:bg-tide-400/20"
      >
        <X className="size-3" aria-hidden />
      </button>
    </span>
  );
}
