import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * Brand mark.
 *
 * A moth, drawn rather than borrowed: night-flying, drawn to light, and — unlike
 * the butterfly it is often mistaken for — active after dark. That is the whole
 * name (夜凪, "night calm") in one shape, and it survives being 20px tall in a
 * favicon, which a kanji glyph does not.
 *
 * Inline SVG rather than a file: it inherits `currentColor` for the gradient
 * stops, needs no extra request, and cannot 404. The gradient id is suffixed
 * per instance because two logos on one page (header and footer) would
 * otherwise share — and clash over — a single definition.
 */
export function LogoMark({
  className,
  id = 'brand',
}: {
  className?: string;
  id?: string;
}) {
  const gradient = `logo-gradient-${id}`;

  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden
      className={cn('shrink-0', className)}
    >
      <defs>
        <linearGradient id={gradient} x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--color-bloom-300)" />
          <stop offset="0.55" stopColor="var(--color-bloom-500)" />
          <stop offset="1" stopColor="var(--color-orchid-500)" />
        </linearGradient>
      </defs>

      {/* Upper wings — the wide, swept pair that carries the silhouette. */}
      <path
        d="M24 17.5 11.8 6.6c-2.6-2.3-6.6-.3-6.4 3.2l.9 12.4c.2 2.7 2.8 4.5 5.4 3.8L24 22.4Z"
        fill={`url(#${gradient})`}
      />
      <path
        d="M24 17.5 36.2 6.6c2.6-2.3 6.6-.3 6.4 3.2l-.9 12.4c-.2 2.7-2.8 4.5-5.4 3.8L24 22.4Z"
        fill={`url(#${gradient})`}
      />

      {/* Lower wings — shorter, rounder, so the pair reads as a moth and not
          as an abstract arrow. */}
      <path
        d="M24 24.6 14.7 29c-2.4 1.1-3 4.2-1.2 6.2l5.3 5.7c1.9 2 5.2 1.1 5.9-1.6L24 33Z"
        fill={`url(#${gradient})`}
        opacity="0.85"
      />
      <path
        d="M24 24.6 33.3 29c2.4 1.1 3 4.2 1.2 6.2l-5.3 5.7c-1.9 2-5.2 1.1-5.9-1.6L24 33Z"
        fill={`url(#${gradient})`}
        opacity="0.85"
      />

      {/* Body and antennae. Thin strokes at this scale disappear, so the body is
          a filled capsule and the antennae are the only strokes in the mark. */}
      <rect x="22.4" y="15.4" width="3.2" height="26" rx="1.6" fill={`url(#${gradient})`} />
      <path
        d="M23 15.2c-1.6-2.6-3.6-4.2-6-4.8M25 15.2c1.6-2.6 3.6-4.2 6-4.8"
        stroke={`url(#${gradient})`}
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Mark plus wordmark.
 *
 * The wordmark is set in wide tracking — the letters are meant to be read as a
 * mark, not as a word in a sentence, and the spacing is what separates the two
 * readings. "FANSUB" sits under it in the accent colour at a size where it
 * qualifies the name without competing with it.
 */
export function Logo({
  size = 'md',
  showWordmark = true,
  href = '/',
  id = 'header',
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
  href?: string | null;
  /** Distinguishes the gradient definitions when several logos share a page. */
  id?: string;
  className?: string;
}) {
  const sizes = {
    sm: { mark: 'size-7', word: 'text-sm tracking-[0.2em]', sub: 'text-[8px] tracking-[0.42em]' },
    md: { mark: 'size-9', word: 'text-lg tracking-[0.22em]', sub: 'text-[9px] tracking-[0.46em]' },
    lg: { mark: 'size-12', word: 'text-2xl tracking-[0.24em]', sub: 'text-[11px] tracking-[0.5em]' },
  }[size];

  const content = (
    <span className={cn('group inline-flex items-center gap-3', className)}>
      <LogoMark
        id={id}
        className={cn(
          sizes.mark,
          'transition-transform duration-base ease-spring',
          'group-hover:scale-110 motion-reduce:group-hover:scale-100',
        )}
      />

      {showWordmark && (
        <span className="flex min-w-0 flex-col leading-none">
          <span className={cn('font-display font-bold text-mist-50 uppercase', sizes.word)}>
            Yonagi
          </span>
          <span className={cn('mt-1 font-medium text-bloom-400 uppercase', sizes.sub)}>
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
