'use client';

import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '@/shared/lib/utils';

/**
 * Dropdown menu.
 *
 * Follows the WAI-ARIA menu-button pattern: arrow keys move between items, Home
 * and End jump to the ends, and Escape closes and returns focus to the trigger.
 * Closes on outside pointer-down (not click) so it dismisses before the
 * underlying element reacts.
 */

export interface DropdownItem {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  href?: string;
  onSelect?: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  /** Renders a divider above this item. */
  separated?: boolean;
  /** Right-aligned hint, e.g. a keyboard shortcut. */
  meta?: ReactNode;
}

export interface DropdownProps {
  trigger: (props: { open: boolean; toggle: () => void; id: string }) => ReactNode;
  items: DropdownItem[];
  align?: 'start' | 'end';
  /** Header shown above the items – used for the account menu. */
  header?: ReactNode;
  className?: string;
  menuClassName?: string;
}

export function Dropdown({
  trigger,
  items,
  align = 'end',
  header,
  className,
  menuClassName,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerId = useId();
  const menuId = `${triggerId}-menu`;

  const enabledIndexes = items
    .map((item, index) => (item.disabled ? -1 : index))
    .filter((index) => index >= 0);

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    setActiveIndex(-1);
    if (restoreFocus) {
      containerRef.current
        ?.querySelector<HTMLElement>('[data-dropdown-trigger-wrapper] button, [data-dropdown-trigger-wrapper] a')
        ?.focus();
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) close(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open, close]);

  // Move real DOM focus with the roving index so screen readers follow along.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    menuRef.current
      ?.querySelectorAll<HTMLElement>('[role="menuitem"]')
      ?.[activeIndex]?.focus({ preventScroll: true });
  }, [open, activeIndex]);

  const step = (direction: 1 | -1) => {
    if (enabledIndexes.length === 0) return;
    const position = enabledIndexes.indexOf(activeIndex);
    const next =
      position === -1
        ? direction === 1
          ? 0
          : enabledIndexes.length - 1
        : (position + direction + enabledIndexes.length) % enabledIndexes.length;
    setActiveIndex(enabledIndexes[next]!);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        close();
        break;
      case 'ArrowDown':
        event.preventDefault();
        if (!open) setOpen(true);
        step(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (!open) setOpen(true);
        step(-1);
        break;
      case 'Home':
        if (open) {
          event.preventDefault();
          setActiveIndex(enabledIndexes[0] ?? -1);
        }
        break;
      case 'End':
        if (open) {
          event.preventDefault();
          setActiveIndex(enabledIndexes[enabledIndexes.length - 1] ?? -1);
        }
        break;
      case 'Tab':
        if (open) close(false);
        break;
      default:
        break;
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn('relative', className)}
      onKeyDown={handleKeyDown}
    >
      <div data-dropdown-trigger-wrapper>
        {trigger({ open, toggle: () => setOpen((value) => !value), id: triggerId })}
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-labelledby={triggerId}
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.12 } }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'absolute z-60 mt-2 min-w-56 origin-top overflow-hidden rounded-xl border border-ink-700 bg-surface-overlay/97 p-1.5 shadow-e4 backdrop-blur-lg',
              align === 'end' ? 'right-0' : 'left-0',
              menuClassName,
            )}
          >
            {header && (
              <div className="border-b border-border-subtle px-3 py-2.5">{header}</div>
            )}

            {items.map((item) => {
              const itemClasses = cn(
                'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm',
                'transition-colors duration-instant',
                'focus-visible:outline-none',
                item.disabled
                  ? 'cursor-not-allowed text-mist-600'
                  : item.tone === 'danger'
                    ? 'text-danger-400 hover:bg-danger-500/12 focus:bg-danger-500/12'
                    : 'text-mist-200 hover:bg-ink-750 hover:text-mist-50 focus:bg-ink-750 focus:text-mist-50',
              );

              const body = (
                <>
                  {item.icon && <span className="shrink-0 opacity-80">{item.icon}</span>}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.meta && (
                    <span className="shrink-0 text-2xs text-mist-500">{item.meta}</span>
                  )}
                </>
              );

              return (
                <div key={item.key}>
                  {item.separated && <div className="my-1.5 h-px bg-border-subtle" />}
                  {item.href && !item.disabled ? (
                    <Link
                      href={item.href}
                      role="menuitem"
                      tabIndex={-1}
                      className={itemClasses}
                      onClick={() => close(false)}
                    >
                      {body}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      role="menuitem"
                      tabIndex={-1}
                      disabled={item.disabled}
                      className={itemClasses}
                      onClick={() => {
                        if (item.disabled) return;
                        item.onSelect?.();
                        close();
                      }}
                    >
                      {body}
                    </button>
                  )}
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
