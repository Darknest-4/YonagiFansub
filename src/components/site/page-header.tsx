import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

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
            <p className="mb-2.5 flex items-center gap-2.5 text-2xs font-bold tracking-[0.22em] text-tide-300 uppercase">
              <span aria-hidden className="h-px w-6 bg-linear-to-r from-tide-400 to-transparent" />
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

export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Morzsamenü" className="mb-5">
      <ol className="flex flex-wrap items-center gap-1.5 text-2xs text-mist-500">
        <li>
          <Link href="/" className="transition-colors hover:text-tide-300">
            Kezdőlap
          </Link>
        </li>

        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
              <ChevronRight className="size-3 shrink-0 text-mist-700" aria-hidden />
              {crumb.href && !last ? (
                <Link href={crumb.href} className="transition-colors hover:text-tide-300">
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
