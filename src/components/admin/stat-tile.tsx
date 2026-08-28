import Link from 'next/link';
import type { ReactNode } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { cn, formatCount } from '@/lib/utils';
import { MiniSparkline } from '@/components/admin/sparkline';

/**
 * Dashboard stat tile.
 *
 * One number, one label, one line of context. The context line is what makes it
 * useful: "1 284" says nothing, "1 284 · +37 ebben a hónapban" says whether
 * things are moving.
 *
 * Tiles that link somewhere say so with a hover treatment; tiles that do not
 * stay visually flat, so nobody clicks a dead card twice.
 */

export type StatTone = 'accent' | 'orchid' | 'warm' | 'success' | 'info';

const TONES: Record<StatTone, { icon: string; glow: string; line: string }> = {
  accent: {
    icon: 'text-bloom-300 bg-bloom-400/10',
    glow: 'hover:border-bloom-400/30',
    line: '#f761a8',
  },
  orchid: {
    icon: 'text-orchid-300 bg-orchid-400/10',
    glow: 'hover:border-orchid-400/30',
    line: '#ab7ffb',
  },
  warm: {
    icon: 'text-ember-300 bg-ember-400/10',
    glow: 'hover:border-ember-400/30',
    line: '#ffc76b',
  },
  success: {
    icon: 'text-success-400 bg-success-500/10',
    glow: 'hover:border-success-500/30',
    line: '#4ade80',
  },
  info: {
    icon: 'text-info-400 bg-info-500/10',
    glow: 'hover:border-info-500/30',
    line: '#60a5fa',
  },
};

export function StatTile({
  label,
  value,
  detail,
  icon,
  href,
  tone = 'accent',
  trend,
  delta,
}: {
  label: string;
  value: number;
  detail?: string;
  icon: ReactNode;
  href?: string;
  tone?: StatTone;
  /** Recent history for the tile's trend line. Fewer than two points draws nothing. */
  trend?: number[];
  /** Percentage change against the preceding period. */
  delta?: number | null;
}) {
  const config = TONES[tone];

  // The id has to be stable and unique per tile; the label already is both, and
  // slugging it keeps it a legal SVG id.
  const chartId = `stat-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="text-2xs tracking-wide text-mist-500 uppercase">{label}</span>
        <span
          aria-hidden
          className={cn('grid size-8 shrink-0 place-items-center rounded-lg', config.icon)}
        >
          {icon}
        </span>
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <p className="nums font-display text-3xl font-bold text-mist-50">{formatCount(value)}</p>

        {/*
          Zero is not shown as a delta. "0%" reads as a measurement, but for most
          of these counters it means "no comparable prior period", and inventing
          a flat trend out of missing data is worse than saying nothing.
        */}
        {typeof delta === 'number' && delta !== 0 && (
          <span
            className={cn(
              'nums inline-flex items-center gap-0.5 text-2xs font-semibold',
              delta > 0 ? 'text-success-400' : 'text-danger-400',
            )}
          >
            {delta > 0 ? (
              <TrendingUp className="size-3" aria-hidden />
            ) : (
              <TrendingDown className="size-3" aria-hidden />
            )}
            {delta > 0 ? '+' : ''}
            {delta}%
          </span>
        )}
      </div>

      {detail && <p className="nums mt-1 text-2xs text-mist-500">{detail}</p>}

      {trend && trend.length > 1 && (
        <div className="mt-3 -mb-1">
          <MiniSparkline data={trend} color={config.line} id={chartId} />
        </div>
      )}
    </>
  );

  const base = 'rounded-xl border border-ink-800 bg-ink-900/50 p-4';

  if (!href) return <div className={base}>{content}</div>;

  return (
    <Link
      href={href}
      className={cn(base, 'block transition-colors duration-fast hover:bg-ink-850', config.glow)}
    >
      {content}
    </Link>
  );
}
