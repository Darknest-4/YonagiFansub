import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, ButtonLink } from '@/components/ui/button';

/**
 * The four states every data-driven surface must handle: loading, empty, error
 * and offline/partial. Having them as first-class components is what stops a
 * screen from silently rendering nothing when a query returns zero rows.
 */

// ── Loading ──────────────────────────────────────────────────────────────────

export function Spinner({
  size = 'md',
  className,
  label = 'Betöltés',
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
}) {
  const sizes = { sm: 'size-4', md: 'size-6', lg: 'size-9' };
  return (
    <span role="status" aria-live="polite" className={cn('inline-flex', className)}>
      <Loader2 className={cn(sizes[size], 'animate-spin text-bloom-400')} aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton', className)} />;
}

/**
 * Skeletons mirror the real layout closely enough that nothing shifts when the
 * content lands. A generic grey box that is the wrong height is worse than no
 * skeleton at all.
 */
export function ProjectCardSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="aspect-2/3 w-full rounded-xl" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-3 w-2/5" />
    </div>
  );
}

export function ProjectGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 xl:gap-5"
      aria-busy="true"
      aria-label="Projektek betöltése"
    >
      {Array.from({ length: count }, (_, index) => (
        <ProjectCardSkeleton key={index} />
      ))}
    </div>
  );
}

export function ReleaseRowSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-border-subtle bg-surface-raised p-4">
      <Skeleton className="size-14 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-3 w-3/5" />
      </div>
      <Skeleton className="hidden h-9 w-28 rounded-lg sm:block" />
    </div>
  );
}

export function ReleaseListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Részek betöltése">
      {Array.from({ length: count }, (_, index) => (
        <ReleaseRowSkeleton key={index} />
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 8, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Adatok betöltése">
      {Array.from({ length: rows }, (_, rowIndex) => (
        <div key={rowIndex} className="flex gap-3 rounded-lg bg-surface-raised px-4 py-3.5">
          {Array.from({ length: columns }, (_, columnIndex) => (
            <Skeleton
              key={columnIndex}
              className={cn('h-4', columnIndex === 0 ? 'w-1/3' : 'flex-1')}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function TextSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2.5" aria-busy="true">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          className={cn('h-3.5', index === lines - 1 ? 'w-2/3' : 'w-full')}
        />
      ))}
    </div>
  );
}

// ── Empty ────────────────────────────────────────────────────────────────────

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: { label: string; href?: string; onClick?: () => void };
  secondaryAction?: { label: string; href: string };
  className?: string;
  compact?: boolean;
}

/**
 * Empty state.
 *
 * Always answers two questions: why is this empty, and what can I do about it.
 * "Nincs találat" on its own is a dead end.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-700 bg-ink-900/40 text-center',
        compact ? 'px-6 py-10' : 'px-6 py-16 sm:py-20',
        className,
      )}
    >
      {icon && (
        <div className="mb-5 flex size-14 items-center justify-center rounded-2xl border border-ink-700 bg-ink-850 text-bloom-300">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-mist-100">{title}</h3>
      {description && (
        <p className="mt-2 max-w-md text-sm leading-relaxed text-content-muted">{description}</p>
      )}
      {(action || secondaryAction) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {action &&
            (action.href ? (
              <ButtonLink href={action.href} variant="primary" size="sm">
                {action.label}
              </ButtonLink>
            ) : (
              <Button variant="primary" size="sm" onClick={action.onClick}>
                {action.label}
              </Button>
            ))}
          {secondaryAction && (
            <ButtonLink href={secondaryAction.href} variant="ghost" size="sm">
              {secondaryAction.label}
            </ButtonLink>
          )}
        </div>
      )}
    </div>
  );
}

// ── Error ────────────────────────────────────────────────────────────────────

export interface ErrorStateProps {
  title?: string;
  description?: ReactNode;
  /** Shown only in development / to staff – never leaks to visitors in prod. */
  detail?: string;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}

export function ErrorState({
  title = 'Valami hiba történt',
  description = 'Nem sikerült betölteni a tartalmat. Próbáld újra, vagy térj vissza később.',
  detail,
  onRetry,
  className,
  compact = false,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-danger-500/25 bg-danger-900/20 text-center',
        compact ? 'px-6 py-10' : 'px-6 py-16',
        className,
      )}
    >
      <div className="mb-5 flex size-14 items-center justify-center rounded-2xl border border-danger-500/30 bg-danger-500/10 text-danger-400">
        <svg viewBox="0 0 24 24" fill="none" className="size-6" aria-hidden>
          <path
            d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-mist-100">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-content-muted">{description}</p>
      {detail && (
        <code className="mt-4 max-w-full overflow-x-auto rounded-lg border border-danger-500/20 bg-ink-950/60 px-3 py-2 text-left text-2xs text-danger-400">
          {detail}
        </code>
      )}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-6" onClick={onRetry}>
          Újrapróbálom
        </Button>
      )}
    </div>
  );
}

/** Inline variant for a single failed widget inside an otherwise working page. */
export function InlineError({ message, className }: { message: string; className?: string }) {
  return (
    <p
      role="alert"
      className={cn(
        'flex items-center gap-2 rounded-lg border border-danger-500/25 bg-danger-900/25 px-3.5 py-2.5 text-sm text-danger-400',
        className,
      )}
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-4 shrink-0" aria-hidden>
        <path
          d="M12 8v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
      {message}
    </p>
  );
}
