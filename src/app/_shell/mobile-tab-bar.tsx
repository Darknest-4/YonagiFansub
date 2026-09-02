'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarDays,
  ChevronUp,
  Clapperboard,
  HelpCircle,
  Home,
  Mail,
  MoreHorizontal,
  Newspaper,
  Package,
  ScrollText,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { isActive, type NavItem } from '@/app/_shell/nav-config';
import { scrollToY, useScrollState } from '@/shared/lib/use-scroll-state';

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
  ScrollText,
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
 *
 * ## Shrinking on scroll
 *
 * A bar that floats over the content covers the last rows of it, and the cost
 * of that is worst exactly when somebody is reading — which is to say, while
 * scrolling. So past 80px the labels collapse and the padding tightens: the
 * island keeps every target reachable while giving back about a fifth of its
 * height, and the labels come back the moment you return to the top.
 *
 * The measured widths above are unaffected — compacting changes height, not the
 * horizontal split.
 */
export function MobileTabBar({
  tabs,
  onMore,
  moreOpen,
}: {
  /**
   * The tabs to show, already filtered for features switched off in the
   * settings — the bar renders what it is handed rather than reading the
   * navigation model itself, so a disabled page cannot survive here.
   */
  tabs: NavItem[];
  onMore: () => void;
  moreOpen: boolean;
}) {
  const pathname = usePathname();

  const { compact, scrolled } = useScrollState();

  // The sheet holds the routes that did not get a tab, so "Több" should look
  // active while you are on one of them — otherwise the bar claims you are
  // nowhere.
  const onOverflowRoute = !tabs.some((item) => isActive(pathname, item));
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
      {/*
        Jump to the far end of the page.

        The direction follows where you already are — down while the page is
        still near the top, back to the top once you have moved. A button that
        always meant "bottom" would be dead weight for the whole second half of
        every page, and one that always meant "top" would be dead weight for the
        first screen.
      */}
      <button
        type="button"
        onClick={() =>
          scrollToY(scrolled ? 0 : document.documentElement.scrollHeight)
        }
        aria-label={scrolled ? 'Ugrás az oldal tetejére' : 'Ugrás az oldal aljára'}
        className={cn(
          'pointer-events-auto mb-1.5 grid h-7 w-14 place-items-center rounded-full',
          'border border-ink-700/70 bg-ink-900/85 text-mist-400 backdrop-blur-xl',
          'transition-[background-color,transform,opacity] duration-base ease-out-expo',
          'active:bg-ink-850',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bloom-400',
          // Shrinks with the bar, so the whole island reads as one object
          // rather than a handle that stayed behind.
          compact && 'h-6 w-11 opacity-80',
        )}
      >
        <ChevronUp
          className={cn(
            'size-4 transition-transform duration-base ease-out-expo',
            // One icon, rotated. A swap between two elements cannot be
            // animated; a rotation shows which way the button now points.
            !scrolled && 'rotate-180',
          )}
          aria-hidden
        />
      </button>

      <nav
        aria-label="Mobil navigáció"
        className={cn(
          // Narrower inset on the smallest phones. At 320px the six targets come
          // out at 45px with a 12px margin — over the 44px floor, but only just;
          // dropping to 8px buys back the margin that makes it comfortable
          // rather than borderline.
          'pointer-events-auto mx-2 w-[calc(100%-1rem)] max-w-md origin-bottom',
          '[@media(width>=360px)]:mx-3 [@media(width>=360px)]:w-[calc(100%-1.5rem)]',
          'rounded-[1.75rem] border border-ink-700/60 bg-ink-950/80 shadow-2xl shadow-black/50 backdrop-blur-2xl',
          // The shrink itself: padding and corner radius, both animated. Scale
          // would be cheaper to composite but blurs the text on the way, and a
          // navigation bar is not a place to trade legibility for a frame.
          'transition-[padding,border-radius] duration-base ease-out-expo',
          compact ? 'p-1 rounded-[1.5rem]' : 'p-1.5',
        )}
      >
        <ul className="flex items-stretch gap-0.5">
          {tabs.map((item) => {
            const active = isActive(pathname, item);
            const Icon = item.icon ? ICONS[item.icon] : Home;

            return (
              <li key={item.href} className="min-w-0 flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex flex-col items-center justify-center rounded-[1.375rem] px-0.5',
                    'transition-[padding,gap,min-height,background-color,color] duration-base ease-out-expo',
                    compact ? 'min-h-10 gap-0 py-1.5' : 'min-h-13 gap-1 py-2',
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
                  {/*
                    Collapsed to nothing rather than removed. `max-height` and
                    `opacity` animate; a node that unmounts snaps, and the bar
                    would jump every time somebody scrolled past the threshold.
                  */}
                  <span
                    className={cn(
                      'max-w-full truncate text-[10px] leading-none',
                      'transition-[max-height,opacity,margin] duration-base ease-out-expo',
                      active ? 'font-bold' : 'font-medium',
                      compact ? 'max-h-0 opacity-0' : 'mt-0 max-h-4 opacity-100',
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
              aria-expanded={moreOpen}
              aria-haspopup="dialog"
              className={cn(
                'flex w-full flex-col items-center justify-center rounded-[1.375rem] px-0.5',
                'transition-[padding,gap,min-height,background-color,color] duration-base ease-out-expo',
                compact ? 'min-h-10 gap-0 py-1.5' : 'min-h-13 gap-1 py-2',
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
                  'transition-[max-height,opacity] duration-base ease-out-expo',
                  moreActive ? 'font-bold' : 'font-medium',
                  compact ? 'max-h-0 opacity-0' : 'max-h-4 opacity-100',
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
