'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { cn } from '@/lib/utils';
import { RELEASE_KIND_LABEL, RESOLUTION_LABEL } from '@/components/ui/badge';

/**
 * Release feed filters.
 *
 * Segmented pills rather than dropdowns: there are only a handful of options and
 * they are the ones people actually toggle, so making them one tap instead of
 * three is worth the horizontal space. The rail scrolls on narrow screens rather
 * than wrapping into an unpredictable number of rows.
 */
export function ReleaseFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const apply = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams.toString());
    if (value === null) next.delete(key);
    else next.set(key, value);
    next.delete('page');

    startTransition(() => {
      router.push(`/kiadasok${next.toString() ? `?${next}` : ''}`, { scroll: false });
    });
  };

  const resolution = searchParams.get('resolution');
  const kind = searchParams.get('kind');
  const sort = searchParams.get('sort') ?? '-releasedAt';

  return (
    <div
      className={cn('space-y-3 transition-opacity duration-fast', pending && 'opacity-60')}
      aria-busy={pending}
    >
      <FilterRail label="Felbontás">
        <Pill active={!resolution} onClick={() => apply('resolution', null)}>
          Mind
        </Pill>
        {Object.entries(RESOLUTION_LABEL).map(([value, label]) => (
          <Pill
            key={value}
            active={resolution === value}
            onClick={() => apply('resolution', value)}
          >
            {label}
          </Pill>
        ))}
      </FilterRail>

      <FilterRail label="Típus">
        <Pill active={!kind} onClick={() => apply('kind', null)}>
          Mind
        </Pill>
        {Object.entries(RELEASE_KIND_LABEL).map(([value, label]) => (
          <Pill key={value} active={kind === value} onClick={() => apply('kind', value)}>
            {label}
          </Pill>
        ))}
      </FilterRail>

      <FilterRail label="Rendezés">
        <Pill active={sort === '-releasedAt'} onClick={() => apply('sort', '-releasedAt')}>
          Legfrissebb
        </Pill>
        <Pill active={sort === '-downloadCount'} onClick={() => apply('sort', '-downloadCount')}>
          Legtöbbet letöltött
        </Pill>
        <Pill active={sort === 'releasedAt'} onClick={() => apply('sort', 'releasedAt')}>
          Legrégebbi
        </Pill>
      </FilterRail>
    </div>
  );
}

function FilterRail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="hidden w-20 shrink-0 text-2xs tracking-wide text-mist-600 uppercase sm:block">
        {label}
      </span>
      <div
        role="group"
        aria-label={label}
        className="-mx-1 flex flex-1 gap-1.5 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'shrink-0 rounded-full border px-3.5 py-1.5 text-2xs font-medium whitespace-nowrap',
        'transition-[background-color,border-color,color] duration-fast',
        active
          ? 'border-bloom-400/40 bg-bloom-400/12 text-bloom-200'
          : 'border-ink-700 bg-ink-900/60 text-mist-400 hover:border-ink-600 hover:text-mist-200',
      )}
    >
      {children}
    </button>
  );
}
