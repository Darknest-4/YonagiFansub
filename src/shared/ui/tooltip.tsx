'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';

/**
 * Tooltip.
 *
 * Shows on hover *and* on keyboard focus (a hover-only tooltip is invisible to
 * keyboard users), dismisses on Escape, and is wired with `aria-describedby` so
 * assistive tech reads it as a description of the trigger rather than as
 * standalone text.
 *
 * Tooltips carry supplementary information only. Anything essential belongs in
 * the visible UI — on touch devices there is no hover at all.
 */

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  delayMs?: number;
  className?: string;
}

const SIDE_CLASSES = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
} as const;

const SIDE_OFFSET = {
  top: { y: 4 },
  bottom: { y: -4 },
  left: { x: 4 },
  right: { x: -4 },
} as const;

export function Tooltip({
  content,
  children,
  side = 'top',
  delayMs = 260,
  className,
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();

  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), delayMs);
  };

  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  };

  return (
    <span
      className={cn('relative inline-flex', className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={hide}
      onKeyDown={(event) => {
        if (event.key === 'Escape') hide();
      }}
    >
      <span aria-describedby={open ? id : undefined} className="inline-flex">
        {children}
      </span>

      <AnimatePresence>
        {open && (
          <motion.span
            id={id}
            role="tooltip"
            initial={{ opacity: 0, ...SIDE_OFFSET[side] }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, ...SIDE_OFFSET[side], transition: { duration: 0.1 } }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'pointer-events-none absolute z-70 w-max max-w-64 rounded-lg border border-ink-600',
              'bg-ink-800/97 px-2.5 py-1.5 text-2xs leading-relaxed text-mist-100 shadow-e3 backdrop-blur-sm',
              SIDE_CLASSES[side],
            )}
          >
            {content}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
