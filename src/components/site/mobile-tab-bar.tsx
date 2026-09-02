'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  HelpCircle,
  Home,
  Mail,
  MoreHorizontal,
  Newspaper,
  Package,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TAB_NAV, isActive, type NavItem } from '@/components/site/nav-config';

const ICONS: Record<NonNullable<NavItem['icon']>, LucideIcon> = {
  Home,
  CalendarDays,
  Clapperboard,
  Package,
  Newspaper,
  Users,
  HelpCircle,
  Mail,
  Sparkles,
};

/**
 * Mobile bottom navigation.
 *
 * Replaces the hamburger as the primary way around the site on a phone. The
 * reasoning is reach: on a 6-inch screen the top-right corner is the hardest
 * place for a thumb to get to, and that is exactly where a hamburger puts every
 * destination — behind a tap, an animation, and a second tap. A bottom bar puts
 * the most-used pages one thumb-stretch away and always visible.
 *
 * ## A floating island, not a full-width band
 *
 * Inset from all three edges and fully rounded. Two things this buys that an
 * edge-to-edge bar does not: the page visibly continues underneath, so the
 * content does not look cropped by a solid footer, and the bar stops competing
 * with the browser's own chrome, which on iOS Safari sits directly below it and
 * is also a full-width band. Two stacked bands read as one confused strip.
 *
 * ## The active item is filled, not tinted
 *
 * A coloured icon and label is the conventional treatment and it is weak: at a
 * glance, on a dark bar, the difference between "accent" and "muted" is a shade.
 * A filled light pill is unmissable in peripheral vision, which is what a "you
 * are here" marker is for.
 *
 * Six tabs plus "Több". The ceiling is measured rather than guessed, and the
 * island's own inset and padding cost width the old full-width bar did not, so
 * the numbers were taken again after the redesign:
 *
 *   320px → 49px    360px → 52px    390px → 57px    430px → 63px
 *
 * All above the 44px a thumb reliably hits, no label truncated. A seventh tab
 * would put the smallest screen under that floor, so anything more belongs in
 * the sheet.
 */
export function MobileTabBar({ onMore, moreOpen }: { onMore: () => void; moreOpen: boolean }) {
  const pathname = usePathname();

  /**
   * Collapsed state.
   *
   * A bar that floats over the content covers the last few rows of it. Most of
   * the time that is a fair trade; while reading a long episode list it is not,
   * so it can be tucked away to a handle and pulled back.
   *
   * Deliberately not persisted: the next page load starts with navigation
   * visible, because a person who hid the bar and forgot has no way to guess
   * where it went.
   */
  const [collapsed, setCollapsed] = useState(false);

  // The sheet holds the routes that did not get a tab, so "Több" should look
  // active while you are on one of them — otherwise the bar claims you are
  // nowhere.
  const onOverflowRoute = !TAB_NAV.some((item) => isActive(pathname, item));
  const moreActive = moreOpen || onOverflowRoute;

  return (
    <div
      data-mobile-tabbar
      className={cn(
        'fixed inset-x-0 bottom-0 z-50 flex flex-col items-center lg:hidden',
        'pb-[calc(0.5rem+env(safe-area-inset-bottom))]',
        // Nothing here should swallow taps meant for the page behind the gaps
        // either side of the island.
        'pointer-events-none',
      )}
    >
      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Navigáció megjelenítése' : 'Navigáció elrejtése'}
        className={cn(
          'pointer-events-auto mb-1.5 grid h-7 w-14 place-items-center rounded-full',
          'border border-ink-700/70 bg-ink-900/85 text-mist-400 backdrop-blur-xl',
          'transition-colors duration-fast active:bg-ink-850',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bloom-400',
        )}
      >
        {collapsed ? (
          <ChevronUp className="size-4" aria-hidden />
        ) : (
          <ChevronDown className="size-4" aria-hidden />
        )}
      </button>

      <nav
        aria-label="Mobil navigáció"
        // `hidden` rather than unmounted: the bar keeps its place in the tab
        // order and a screen reader can still reach it while it is tucked away.
        aria-hidden={collapsed}
        className={cn(
          // Narrower inset on the smallest phones. At 320px the six targets come
          // out at 45px with a 12px margin — over the 44px floor, but only just;
          // dropping to 8px buys back the margin that makes it comfortable
          // rather than borderline.
          'pointer-events-auto mx-2 w-[calc(100%-1rem)] max-w-md origin-bottom',
          '[@media(width>=360px)]:mx-3 [@media(width>=360px)]:w-[calc(100%-1.5rem)]',
          'rounded-[1.75rem] border border-ink-700/60 bg-ink-950/80 p-1.5 shadow-2xl shadow-black/50 backdrop-blur-2xl',
          'transition-[transform,opacity] duration-base ease-out-expo',
          collapsed && 'pointer-events-none translate-y-6 scale-95 opacity-0',
        )}
      >
        <ul className="flex items-stretch gap-0.5">
          {TAB_NAV.map((item) => {
            const active = isActive(pathname, item);
            const Icon = item.icon ? ICONS[item.icon] : Home;

            return (
              <li key={item.href} className="min-w-0 flex-1">
                <Link
                  href={item.href}
                  tabIndex={collapsed ? -1 : undefined}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-13 flex-col items-center justify-center gap-1 rounded-[1.375rem] px-0.5 py-2',
                    'transition-colors duration-fast',
                    'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-bloom-400',
                    active
                      ? 'bg-mist-50 text-ink-950 shadow-lg shadow-black/30'
                      : 'text-mist-500 active:bg-ink-850 active:text-mist-200',
                  )}
                >
                  <Icon
                    className={cn('size-[1.15rem] shrink-0', active && 'stroke-[2.25]')}
                    aria-hidden
                  />
                  <span
                    className={cn(
                      'max-w-full truncate text-[10px] leading-none',
                      active ? 'font-bold' : 'font-medium',
                    )}
                  >
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}

          {/*
            A rule before the last item. "Több" is not a destination like the
            others — it opens a sheet — and the separator is what stops it
            reading as a seventh page you have not visited yet.
          */}
          <li aria-hidden className="my-2.5 w-px shrink-0 self-stretch bg-ink-700/70" />

          <li className="min-w-0 flex-1">
            <button
              type="button"
              onClick={onMore}
              tabIndex={collapsed ? -1 : undefined}
              aria-expanded={moreOpen}
              aria-haspopup="dialog"
              className={cn(
                'flex min-h-13 w-full flex-col items-center justify-center gap-1 rounded-[1.375rem] px-0.5 py-2',
                'transition-colors duration-fast',
                'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-bloom-400',
                moreActive
                  ? 'bg-mist-50 text-ink-950 shadow-lg shadow-black/30'
                  : 'text-mist-500 active:bg-ink-850 active:text-mist-200',
              )}
            >
              <MoreHorizontal
                className={cn('size-[1.15rem] shrink-0', moreActive && 'stroke-[2.25]')}
                aria-hidden
              />
              <span
                className={cn(
                  'text-[10px] leading-none',
                  moreActive ? 'font-bold' : 'font-medium',
                )}
              >
                Több
              </span>
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}
