import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * Brand mark.
 *
 * 夜凪 — "night calm". The kanji is the mark; the wordmark sits beside it. The
 * glyph is rendered as text rather than an SVG so it inherits the type ramp and
 * stays crisp at every size, and it is `aria-hidden` because the accessible name
 * comes from the wordmark next to it.
 */
export function Logo({
  size = 'md',
  showWordmark = true,
  href = '/',
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
  href?: string | null;
  className?: string;
}) {
  const sizes = {
    sm: { mark: 'size-8 text-base', word: 'text-sm', sub: 'text-[8px]' },
    md: { mark: 'size-9 text-lg', word: 'text-base', sub: 'text-[9px]' },
    lg: { mark: 'size-12 text-2xl', word: 'text-xl', sub: 'text-[10px]' },
  }[size];

  const content = (
    <span className={cn('group inline-flex items-center gap-2.5', className)}>
      <span
        aria-hidden
        className={cn(
          'relative grid shrink-0 place-items-center rounded-xl font-jp font-bold',
          'bg-linear-140 from-tide-400 to-orchid-500 text-ink-950',
          'shadow-glow-tide transition-transform duration-base ease-spring',
          'group-hover:scale-105 motion-reduce:group-hover:scale-100',
          sizes.mark,
        )}
      >
        夜
      </span>

      {showWordmark && (
        <span className="flex min-w-0 flex-col leading-none">
          <span
            className={cn(
              'font-display font-extrabold tracking-tight text-mist-50',
              sizes.word,
            )}
          >
            Yonagi
          </span>
          <span
            className={cn(
              'mt-0.5 font-medium tracking-[0.28em] text-tide-300/80 uppercase',
              sizes.sub,
            )}
          >
            Fansub
          </span>
        </span>
      )}
    </span>
  );

  if (!href) return content;

  return (
    <Link href={href} aria-label="Yonagi Fansub – kezdőlap" className="inline-flex">
      {content}
    </Link>
  );
}
