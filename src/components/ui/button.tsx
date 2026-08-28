import Link from 'next/link';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Button.
 *
 * One component covers `<button>` and `<a>`: passing `href` renders a Next
 * `<Link>` with identical styling, so a "button" never loses link semantics (and
 * middle-click, and open-in-new-tab) just because it looks like a button.
 *
 * `loading` disables interaction and keeps the label in place — swapping the
 * label for a spinner would collapse the button's width and shift the layout.
 */

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'subtle'
  | 'danger'
  | 'warm';

export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';

const VARIANTS: Record<ButtonVariant, string> = {
  // The primary action: gradient fill, dark ink label. Exactly one per view.
  primary:
    'bg-linear-100 from-bloom-400 via-bloom-400 to-orchid-400 text-ink-950 font-semibold ' +
    'shadow-e2 hover:shadow-glow-bloom hover:brightness-110 active:brightness-95',
  secondary:
    'bg-ink-750 text-mist-100 border border-ink-600 hover:bg-ink-700 hover:border-ink-500 ' +
    'active:bg-ink-800',
  outline:
    'border border-bloom-400/40 text-bloom-200 hover:bg-bloom-400/10 hover:border-bloom-400/70 ' +
    'active:bg-bloom-400/5',
  ghost: 'text-mist-300 hover:bg-ink-800 hover:text-mist-100 active:bg-ink-850',
  subtle: 'bg-ink-800/70 text-mist-200 hover:bg-ink-750 active:bg-ink-800',
  danger:
    'bg-danger-500/15 text-danger-400 border border-danger-500/35 hover:bg-danger-500/25 ' +
    'hover:border-danger-500/60 active:bg-danger-500/10',
  warm:
    'bg-ember-400 text-ink-950 font-semibold hover:bg-ember-300 hover:shadow-glow-ember ' +
    'active:brightness-95',
};

const SIZES: Record<ButtonSize, string> = {
  xs: 'h-7 px-2.5 text-2xs gap-1.5 rounded-md',
  sm: 'h-9 px-3.5 text-sm gap-2 rounded-md',
  md: 'h-11 px-5 text-sm gap-2 rounded-lg',
  lg: 'h-13 px-7 text-base gap-2.5 rounded-xl',
  icon: 'size-11 rounded-lg',
  'icon-sm': 'size-9 rounded-md',
};

const BASE = cn(
  'relative inline-flex items-center justify-center whitespace-nowrap select-none',
  'font-medium tracking-tight',
  'transition-[background-color,border-color,color,box-shadow,transform,filter] duration-fast ease-out-quint',
  // A 1px lift on press reads as physical without moving surrounding content.
  'active:translate-y-px',
  'disabled:pointer-events-none disabled:opacity-45 disabled:saturate-50',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bloom-400',
  // Touch targets stay finger-sized regardless of visual size.
  'touch-manipulation',
);

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export interface ButtonProps
  extends CommonProps,
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> {
  href?: undefined;
}

export interface ButtonLinkProps extends CommonProps {
  href: string;
  external?: boolean;
  prefetch?: boolean;
  target?: string;
  rel?: string;
  'aria-label'?: string;
  onClick?: () => void;
}

function content({
  loading,
  leadingIcon,
  trailingIcon,
  children,
}: Pick<CommonProps, 'loading' | 'leadingIcon' | 'trailingIcon' | 'children'>) {
  return (
    <>
      {loading ? (
        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
      ) : (
        leadingIcon
      )}
      {children}
      {!loading && trailingIcon}
    </>
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    fullWidth = false,
    leadingIcon,
    trailingIcon,
    className,
    children,
    disabled,
    type = 'button',
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className)}
      {...props}
    >
      {content({ loading, leadingIcon, trailingIcon, children })}
    </button>
  );
});

export function ButtonLink({
  variant = 'secondary',
  size = 'md',
  loading = false,
  fullWidth = false,
  leadingIcon,
  trailingIcon,
  className,
  children,
  href,
  external,
  prefetch,
  ...props
}: ButtonLinkProps) {
  const classes = cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className);
  const isExternal = external ?? /^https?:\/\//i.test(href);

  if (isExternal) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={classes}
        {...props}
      >
        {content({ loading, leadingIcon, trailingIcon, children })}
      </a>
    );
  }

  return (
    <Link href={href} prefetch={prefetch} className={classes} {...props}>
      {content({ loading, leadingIcon, trailingIcon, children })}
    </Link>
  );
}
