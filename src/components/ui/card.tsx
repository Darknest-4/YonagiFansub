import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Card — the primary content container.
 *
 * Three visual registers, used consistently across the whole product:
 *   • `plain`     – flat surface, the workhorse.
 *   • `glass`     – translucent, for anything overlaying imagery.
 *   • `gradient`  – hairline gradient border, reserved for featured content.
 *
 * `interactive` adds the hover language (lift + border warm-up) and should only
 * be set when the whole card is genuinely clickable.
 */

export interface CardProps {
  children: ReactNode;
  variant?: 'plain' | 'glass' | 'gradient' | 'ghost';
  interactive?: boolean;
  padded?: boolean;
  as?: ElementType;
  className?: string;
}

export function Card({
  children,
  variant = 'plain',
  interactive = false,
  padded = false,
  as: Component = 'div',
  className,
}: CardProps) {
  return (
    <Component
      className={cn(
        'relative rounded-xl',
        variant === 'plain' && 'border border-border-subtle bg-surface-raised',
        variant === 'glass' && 'surface-glass',
        variant === 'gradient' && 'border-gradient bg-surface-raised',
        variant === 'ghost' && 'bg-ink-900/40',
        padded && 'p-5 sm:p-6',
        interactive &&
          cn(
            'group/card transition-[transform,box-shadow,border-color,background-color]',
            'duration-base ease-out-quint will-change-transform',
            'hover:-translate-y-1 hover:shadow-e3 hover:border-ink-600',
            'focus-within:-translate-y-1 focus-within:shadow-e3',
            'motion-reduce:hover:translate-y-0 motion-reduce:focus-within:translate-y-0',
          ),
        className,
      )}
    >
      {children}
    </Component>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle px-5 py-4 sm:px-6',
        className,
      )}
    >
      <div className="min-w-0">
        <h3 className="truncate text-base font-semibold text-mist-50">{title}</h3>
        {description && <p className="mt-1 text-sm text-content-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn('px-5 py-5 sm:px-6', className)}>{children}</div>;
}

export function CardFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-3 border-t border-border-subtle px-5 py-4 sm:px-6',
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Section heading used between content blocks on the public site.
 * The eyebrow carries the Japanese accent that runs through the brand.
 */
export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  align = 'left',
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  align?: 'left' | 'center';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-end justify-between gap-x-6 gap-y-4',
        align === 'center' && 'flex-col items-center text-center',
        className,
      )}
    >
      <div className={cn('max-w-2xl', align === 'center' && 'mx-auto')}>
        {eyebrow && (
          <span className="mb-2.5 flex items-center gap-2.5 text-2xs font-bold tracking-[0.22em] text-tide-300 uppercase">
            <span aria-hidden className="h-px w-6 bg-linear-to-r from-tide-400 to-transparent" />
            {eyebrow}
          </span>
        )}
        <h2 className="text-2xl sm:text-3xl">{title}</h2>
        {description && (
          <p className="mt-3 text-sm leading-relaxed text-content-muted sm:text-base">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
