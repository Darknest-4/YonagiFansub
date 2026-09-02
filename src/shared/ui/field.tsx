'use client';

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { AlertCircle, Check, ChevronDown } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

/**
 * Form primitives.
 *
 * Accessibility is built in rather than opt-in: every control gets a generated
 * id, a programmatically associated label, `aria-describedby` wiring for hint
 * and error text, and `aria-invalid`. A screen-reader user hears the same
 * information a sighted user sees, in the same order.
 *
 * Errors are rendered with an icon *and* colour — colour alone would fail for
 * the ~8% of men with a red/green deficiency.
 */

const CONTROL_BASE = cn(
  'w-full rounded-lg border bg-ink-900/80 text-mist-100 placeholder:text-mist-600',
  'transition-[border-color,box-shadow,background-color] duration-fast ease-out-quint',
  'focus:border-bloom-400/70 focus:bg-ink-900 focus:ring-3 focus:ring-bloom-400/15',
  'disabled:cursor-not-allowed disabled:opacity-50',
  // 16px on mobile prevents iOS Safari from zooming the viewport on focus.
  'text-base sm:text-sm',
);

const CONTROL_SIZES = {
  sm: 'h-9 px-3',
  md: 'h-11 px-3.5',
  lg: 'h-13 px-4',
} as const;

export interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | string[] | null;
  required?: boolean;
  optionalLabel?: boolean;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
  className?: string;
}

/**
 * Field wrapper. Owns the label/hint/error layout and the aria plumbing so the
 * controls themselves stay dumb.
 */
export function Field({
  label,
  hint,
  error,
  required,
  optionalLabel,
  children,
  className,
}: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const messages = Array.isArray(error) ? error : error ? [error] : [];
  const invalid = messages.length > 0;

  const describedBy =
    [hint ? hintId : null, invalid ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={id} className="flex items-center gap-1.5 text-sm font-medium text-mist-200">
          {label}
          {required && (
            <span className="text-danger-400" aria-hidden>
              *
            </span>
          )}
          {optionalLabel && !required && (
            <span className="text-2xs font-normal text-mist-500">(opcionális)</span>
          )}
        </label>
      )}

      {children({ id, describedBy, invalid })}

      {hint && !invalid && (
        <p id={hintId} className="text-xs leading-relaxed text-mist-500">
          {hint}
        </p>
      )}

      {invalid && (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-1.5 text-xs leading-relaxed text-danger-400"
        >
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>{messages.join(' ')}</span>
        </p>
      )}
    </div>
  );
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  inputSize?: keyof typeof CONTROL_SIZES;
  leadingIcon?: ReactNode;
  trailingSlot?: ReactNode;
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { inputSize = 'md', leadingIcon, trailingSlot, invalid, className, ...props },
  ref,
) {
  const control = (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        CONTROL_BASE,
        CONTROL_SIZES[inputSize],
        invalid ? 'border-danger-500/60 focus:ring-danger-500/15' : 'border-ink-700',
        leadingIcon && 'pl-10',
        trailingSlot && 'pr-11',
        className,
      )}
      {...props}
    />
  );

  if (!leadingIcon && !trailingSlot) return control;

  return (
    <div className="relative">
      {leadingIcon && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-mist-500"
        >
          {leadingIcon}
        </span>
      )}
      {control}
      {trailingSlot && (
        <span className="absolute inset-y-0 right-1.5 flex items-center">{trailingSlot}</span>
      )}
    </div>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  /** Shows a live character counter against `maxLength`. */
  showCount?: boolean;
  value?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, className, showCount, value, maxLength, ...props },
  ref,
) {
  const textarea = (
    <textarea
      ref={ref}
      value={value}
      maxLength={maxLength}
      aria-invalid={invalid || undefined}
      className={cn(
        CONTROL_BASE,
        'min-h-28 resize-y px-3.5 py-2.5 leading-relaxed',
        invalid ? 'border-danger-500/60 focus:ring-danger-500/15' : 'border-ink-700',
        className,
      )}
      {...props}
    />
  );

  if (!showCount || !maxLength) return textarea;

  const length = value?.length ?? 0;
  const near = length > maxLength * 0.9;

  return (
    <div className="space-y-1">
      {textarea}
      <div
        className={cn('nums text-right text-2xs', near ? 'text-warning-400' : 'text-mist-600')}
        aria-live="polite"
      >
        {length} / {maxLength}
      </div>
    </div>
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  selectSize?: keyof typeof CONTROL_SIZES;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid, className, children, selectSize = 'md', ...props },
  ref,
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          CONTROL_BASE,
          CONTROL_SIZES[selectSize],
          'cursor-pointer appearance-none pr-10',
          invalid ? 'border-danger-500/60 focus:ring-danger-500/15' : 'border-ink-700',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-mist-500"
      />
    </div>
  );
});

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  description?: ReactNode;
}

export function Checkbox({ label, description, className, id, ...props }: CheckboxProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className={cn('flex gap-3', className)}>
      <span className="relative mt-0.5 inline-flex size-5 shrink-0">
        <input
          id={inputId}
          type="checkbox"
          className="peer size-5 cursor-pointer appearance-none rounded-md border border-ink-600 bg-ink-900 transition-colors duration-fast checked:border-bloom-400 checked:bg-bloom-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bloom-400 disabled:cursor-not-allowed disabled:opacity-50"
          {...props}
        />
        <Check
          aria-hidden
          className="pointer-events-none absolute inset-0 m-auto size-3.5 scale-75 text-ink-950 opacity-0 transition-[opacity,transform] duration-fast peer-checked:scale-100 peer-checked:opacity-100"
          strokeWidth={3}
        />
      </span>
      <label htmlFor={inputId} className="cursor-pointer select-none">
        <span className="block text-sm text-mist-200">{label}</span>
        {description && (
          <span className="mt-0.5 block text-xs leading-relaxed text-mist-500">{description}</span>
        )}
      </label>
    </div>
  );
}

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  className,
}: SwitchProps) {
  const id = useId();

  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <label htmlFor={id} className="min-w-0 cursor-pointer select-none">
        <span className="block text-sm font-medium text-mist-200">{label}</span>
        {description && (
          <span className="mt-0.5 block text-xs leading-relaxed text-mist-500">{description}</span>
        )}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border transition-colors duration-base ease-out-quint',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bloom-400',
          checked ? 'border-bloom-400 bg-bloom-400/85' : 'border-ink-600 bg-ink-750',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute top-1/2 size-4.5 -translate-y-1/2 rounded-full shadow-e1 transition-[left,background-color] duration-base ease-out-quint',
            checked ? 'left-[calc(100%-1.25rem)] bg-ink-950' : 'left-0.75 bg-mist-400',
          )}
        />
      </button>
    </div>
  );
}
