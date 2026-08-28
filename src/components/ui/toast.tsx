'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';

/**
 * Toast notifications.
 *
 * Rendered in an `aria-live` region so screen readers announce them without
 * stealing focus. Errors use `assertive` (they interrupt); everything else is
 * `polite`. Timers pause on hover and on focus, so a toast can never disappear
 * while the user is reaching for its action.
 *
 * Positioned bottom-centre on mobile (thumb reach, clear of the notch) and
 * bottom-right on desktop.
 */

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  duration: number;
}

type ToastInput = Omit<Partial<Toast>, 'id'> & { title: string };

interface ToastContextValue {
  toasts: Toast[];
  push: (toast: ToastInput) => string;
  dismiss: (id: string) => void;
  success: (title: string, description?: string) => string;
  error: (title: string, description?: string) => string;
  warning: (title: string, description?: string) => string;
  info: (title: string, description?: string) => string;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_VISIBLE = 4;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  /** Remaining milliseconds per toast, so a paused timer resumes where it stopped. */
  const remaining = useRef(new Map<string, { left: number; startedAt: number }>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    remaining.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  /** Pointer or keyboard focus on a toast freezes its countdown. */
  const pause = useCallback((id: string) => {
    const timer = timers.current.get(id);
    const state = remaining.current.get(id);
    if (!timer || !state) return;

    clearTimeout(timer);
    timers.current.delete(id);
    remaining.current.set(id, {
      left: Math.max(0, state.left - (Date.now() - state.startedAt)),
      startedAt: Date.now(),
    });
  }, []);

  const resume = useCallback(
    (id: string) => {
      const state = remaining.current.get(id);
      if (!state || timers.current.has(id) || state.left <= 0) return;

      remaining.current.set(id, { left: state.left, startedAt: Date.now() });
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), state.left),
      );
    },
    [dismiss],
  );

  const push = useCallback(
    (input: ToastInput) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const toast: Toast = {
        id,
        tone: input.tone ?? 'info',
        title: input.title,
        description: input.description,
        action: input.action,
        // Errors linger: they usually carry something the user must read.
        duration: input.duration ?? (input.tone === 'error' ? 8000 : 5000),
      };

      setToasts((current) => [...current, toast].slice(-MAX_VISIBLE));

      if (toast.duration > 0) {
        remaining.current.set(id, { left: toast.duration, startedAt: Date.now() });
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), toast.duration),
        );
      }

      return id;
    },
    [dismiss],
  );

  // Clear every pending timer when the provider unmounts.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      toasts,
      push,
      dismiss,
      success: (title, description) => push({ tone: 'success', title, description }),
      error: (title, description) => push({ tone: 'error', title, description }),
      warning: (title, description) => push({ tone: 'warning', title, description }),
      info: (title, description) => push({ tone: 'info', title, description }),
    }),
    [toasts, push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} onPause={pause} onResume={resume} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used inside <ToastProvider>.');
  }
  return context;
}

const TONE_CONFIG: Record<
  ToastTone,
  { icon: typeof Info; ring: string; iconColor: string; live: 'polite' | 'assertive' }
> = {
  success: {
    icon: CheckCircle2,
    ring: 'border-success-500/30',
    iconColor: 'text-success-400',
    live: 'polite',
  },
  error: {
    icon: XCircle,
    ring: 'border-danger-500/35',
    iconColor: 'text-danger-400',
    live: 'assertive',
  },
  warning: {
    icon: AlertTriangle,
    ring: 'border-warning-500/30',
    iconColor: 'text-warning-400',
    live: 'polite',
  },
  info: { icon: Info, ring: 'border-bloom-400/30', iconColor: 'text-bloom-300', live: 'polite' },
};

function ToastViewport({
  toasts,
  onDismiss,
  onPause,
  onResume,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
}) {
  return (
    <div
      className={cn(
        // `toast-viewport` is the hook globals.css uses to lift the stack above
        // the mobile tab bar — but only in the shell that actually renders one.
        'toast-viewport pointer-events-none fixed inset-x-0 bottom-0 z-200 flex flex-col items-center gap-2.5 p-4',
        'sm:inset-x-auto sm:right-0 sm:items-end sm:p-6',
      )}
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const config = TONE_CONFIG[toast.tone];
          const Icon = config.icon;

          return (
            <motion.div
              key={toast.id}
              layout
              role={toast.tone === 'error' ? 'alert' : 'status'}
              aria-live={config.live}
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.96, transition: { duration: 0.18 } }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              onMouseEnter={() => onPause(toast.id)}
              onMouseLeave={() => onResume(toast.id)}
              onFocusCapture={() => onPause(toast.id)}
              onBlurCapture={() => onResume(toast.id)}
              className={cn(
                'pointer-events-auto w-full max-w-md rounded-xl border bg-surface-overlay/95 p-4 shadow-e4 backdrop-blur-md',
                config.ring,
              )}
            >
              <div className="flex gap-3">
                <Icon className={cn('mt-0.5 size-5 shrink-0', config.iconColor)} aria-hidden />

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-mist-50">{toast.title}</p>
                  {toast.description && (
                    <p className="mt-1 text-sm leading-relaxed text-content-muted">
                      {toast.description}
                    </p>
                  )}
                  {toast.action && (
                    <button
                      type="button"
                      onClick={() => {
                        toast.action?.onClick();
                        onDismiss(toast.id);
                      }}
                      className="mt-2.5 text-sm font-medium text-bloom-300 underline-offset-4 transition-colors duration-fast hover:text-bloom-200 hover:underline"
                    >
                      {toast.action.label}
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => onDismiss(toast.id)}
                  aria-label="Értesítés bezárása"
                  className="-mt-1 -mr-1 h-fit shrink-0 rounded-md p-1.5 text-mist-500 transition-colors duration-fast hover:bg-ink-750 hover:text-mist-200"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
