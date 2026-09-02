import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { breadcrumbJsonLd } from '@/lib/seo';
import { siteUrl } from '@/lib/site-url';

/**
 * Page header.
 *
 * Every non-home page opens with this, which is what makes the site feel like
 * one product rather than a set of screens. The breadcrumb is rendered as a real
 * `<nav>` with an ordered list so it is navigable by landmark, and the JSON-LD
 * emitted alongside it gives search engines the same hierarchy.
 */

export interface Crumb {
  label: string;
  href?: string;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  crumbs,
  action,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  crumbs?: Crumb[];
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('relative', className)}>
      {crumbs && crumbs.length > 0 && <Breadcrumbs crumbs={crumbs} />}

      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="max-w-2xl">
          {eyebrow && (
            <p className="mb-2.5 flex items-center gap-2.5 text-2xs font-bold tracking-[0.22em] text-bloom-300 uppercase">
              <span aria-hidden className="h-px w-6 bg-linear-to-r from-bloom-400 to-transparent" />
              {eyebrow}
            </p>
          )}

          <h1 className="text-3xl sm:text-4xl">{title}</h1>

          {description && (
            <p className="mt-3.5 text-sm leading-relaxed text-content-muted sm:text-base">
              {description}
            </p>
          )}
        </div>

        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  );
}

export async function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  /*
    A strukturált adat ugyanabból a tömbből készül, amiből a látható nyomvonal.

    Ez nem kényelmi kérdés. Egy morzsamenü-jelölés, ami mást mond, mint ami az
    oldalon látszik, rosszabb, mint a semmi: a kereső eltérésként kezeli, és
    onnantól az oldal többi strukturált adatában sem bízik. Ha egy forrásból
    származnak, nem tudnak széttartani.

    A „Kezdőlap" itt is az első elem, ahogy a listában — a jelölésnek a teljes
    utat kell leírnia, nem csak a láthatóan linkelt részét.
  */
  const jsonLd = breadcrumbJsonLd(
    [
      { name: 'Kezdőlap', path: '/' },
    // A `href` nélküli morzsa — jellemzően az utolsó, az aktuális oldal — cím
    // nélkül kerül a jelölésbe. Kitalálni neki egyet annyi lenne, mint rossz
    // helyre mutatni.
      ...crumbs.map((crumb) => ({ name: crumb.label, path: crumb.href })),
    ],
    await siteUrl(),
  );

  return (
    <nav aria-label="Morzsamenü" className="mb-5">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <ol className="flex flex-wrap items-center gap-1.5 text-2xs text-mist-500">
        <li>
          <Link href="/" className="transition-colors hover:text-bloom-300">
            Kezdőlap
          </Link>
        </li>

        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
              <ChevronRight className="size-3 shrink-0 text-mist-700" aria-hidden />
              {crumb.href && !last ? (
                <Link href={crumb.href} className="transition-colors hover:text-bloom-300">
                  {crumb.label}
                </Link>
              ) : (
                <span aria-current={last ? 'page' : undefined} className="text-mist-300">
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
