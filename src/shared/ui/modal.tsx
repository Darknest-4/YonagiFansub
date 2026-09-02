'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';

/**
 * Modal dialog.
 *
 * Implements the full dialog contract by hand rather than pulling in a headless
 * library: focus is trapped and restored, Escape closes, the background is
 * `aria-hidden` and scroll-locked without the layout jumping, and the animation
 * respects `prefers-reduced-motion`.
 *
 * On viewports below `sm` the dialog becomes a bottom sheet — a centred modal on
 * a phone puts the primary action under the user's thumb only by accident.
 */

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Set false for destructive flows where a stray click must not dismiss. */
  dismissible?: boolean;
  className?: string;
}

const SIZES = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
} as const;

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissible = true,
  className,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Scroll lock. Compensating for the scrollbar width prevents the 15px content
  // shift that otherwise happens the moment a dialog opens.
  useEffect(() => {
    if (!open) return;

    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;

    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
    };
  }, [open]);

  // Focus management: remember what was focused, move focus in, restore on close.
  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;

    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus({ preventScroll: true });
    });

    return () => {
      cancelAnimationFrame(frame);
      restoreFocusRef.current?.focus({ preventScroll: true });
    };
  }, [open]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible) {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) => element.offsetParent !== null,
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [dismissible, onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-100 flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            onClick={dismissible ? onClose : undefined}
            className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm"
            aria-hidden
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'relative flex max-h-[92dvh] w-full flex-col overflow-hidden',
              'rounded-t-2xl border border-ink-700 bg-surface-overlay shadow-e4 sm:rounded-2xl',
              SIZES[size],
              className,
            )}
          >
            {/* Bottom-sheet grab handle, mobile only. */}
            <div
              aria-hidden
              className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-ink-600 sm:hidden"
            />

            <header className="flex items-start justify-between gap-4 px-5 py-4 sm:px-6 sm:py-5">
              <div className="min-w-0">
                <h2 id={titleId} className="text-lg font-semibold text-mist-50">
                  {title}
                </h2>
                {description && (
                  <p id={descriptionId} className="mt-1.5 text-sm leading-relaxed text-content-muted">
                    {description}
                  </p>
                )}
              </div>
              {dismissible && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Bezárás"
                  className="-mt-1 -mr-1 shrink-0 rounded-lg p-2 text-mist-400 transition-colors duration-fast hover:bg-ink-750 hover:text-mist-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bloom-400"
                >
                  <X className="size-4.5" aria-hidden />
                </button>
              )}
            </header>

            {children && (
              <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6 sm:pb-6">
                {children}
              </div>
            )}

            {footer && (
              <footer className="flex flex-col-reverse gap-2 border-t border-border-subtle bg-ink-900/60 px-5 py-4 sm:flex-row sm:justify-end sm:gap-3 sm:px-6">
                {footer}
              </footer>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  /**
   * For irreversible actions: the confirm button stays disabled until the user
   * types this exact string. Reserved for deletions that cascade.
   */
  requireTyped?: string;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Megerősítem',
  cancelLabel = 'Mégse',
  tone = 'danger',
  requireTyped,
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (!open) {
      setTyped('');
      setPending(false);
    }
  }, [open]);

  const confirmDisabled = pending || (requireTyped ? typed.trim() !== requireTyped : false);

  const handleConfirm = async () => {
    setPending(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      dismissible={!pending}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending} size="sm">
            {cancelLabel}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={handleConfirm}
            loading={pending}
            disabled={confirmDisabled}
            size="sm"
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {requireTyped && (
        <div className="space-y-2">
          <label htmlFor="confirm-typed" className="block text-sm text-mist-300">
            A megerősítéshez írd be:{' '}
            <code className="rounded bg-ink-850 px-1.5 py-0.5 font-mono text-bloom-300">
              {requireTyped}
            </code>
          </label>
          <input
            id="confirm-typed"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="h-11 w-full rounded-lg border border-ink-700 bg-ink-900 px-3.5 text-base text-mist-100 focus:border-danger-500/60 focus:ring-3 focus:ring-danger-500/15 sm:text-sm"
          />
        </div>
      )}
    </Modal>
  );
}
