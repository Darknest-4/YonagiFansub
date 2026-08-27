import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn, formatCount } from '@/lib/utils';

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

export type StatTone = 'accent' | 'orchid' | 'warm' | 'success';

const TONES: Record<StatTone, { icon: string; glow: string }> = {
  accent: { icon: 'text-tide-300 bg-tide-400/10', glow: 'hover:border-tide-400/30' },
  orchid: { icon: 'text-orchid-300 bg-orchid-400/10', glow: 'hover:border-orchid-400/30' },
  warm: { icon: 'text-ember-300 bg-ember-400/10', glow: 'hover:border-ember-400/30' },
  success: { icon: 'text-success-400 bg-success-500/10', glow: 'hover:border-success-500/30' },
};

export function StatTile({
  label,
  value,
  detail,
  icon,
  href,
  tone = 'accent',
}: {
  label: string;
  value: number;
  detail?: string;
  icon: ReactNode;
  href?: string;
  tone?: StatTone;
}) {
  const config = TONES[tone];

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

      <p className="nums mt-3 font-display text-3xl font-bold text-mist-50">
        {formatCount(value)}
      </p>

      {detail && <p className="nums mt-1 text-2xs text-mist-500">{detail}</p>}
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
