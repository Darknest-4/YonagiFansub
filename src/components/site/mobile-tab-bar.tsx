'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarDays,
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
 * the four most-used pages one thumb-stretch away and always visible, so the
 * current section is legible without opening anything.
 *
 * Five tabs plus "Több". The ceiling here was an estimate — "five slots, ~64px
 * each" — until it was measured: six slots come out at 60px on a 360px screen
 * and 56px on a 320px one, with no label truncated at either size. Both clear
 * the 44px minimum a thumb needs, so the sixth was worth having rather than
 * pushing a weekly destination one tap deep.
 *
 * Seven would not fit. Anything past this belongs in the sheet, which is the
 * right place for pages people visit once.
 *
 * The bar is `fixed`, so `SiteFooter` carries matching bottom padding — content
 * that ends underneath a floating bar reads as content that got cut off.
 */
export function MobileTabBar({ onMore, moreOpen }: { onMore: () => void; moreOpen: boolean }) {
  const pathname = usePathname();

  // The sheet holds the routes that did not get a tab, so "Több" should look
  // active while you are on one of them — otherwise the bar claims you are
  // nowhere.
  const onOverflowRoute = !TAB_NAV.some((item) => isActive(pathname, item));

  return (
    <nav
      aria-label="Mobil navigáció"
      data-mobile-tabbar
      className={cn(
        'fixed inset-x-0 bottom-0 z-50 lg:hidden',
        'border-t border-ink-800 bg-ink-950/92 backdrop-blur-xl',
        // Clears the iPhone home indicator. Zero on every device without one.
        'pb-[env(safe-area-inset-bottom)]',
      )}
    >
      <ul className="mx-auto flex max-w-lg items-stretch">
        {TAB_NAV.map((item) => {
          const active = isActive(pathname, item);
          const Icon = item.icon ? ICONS[item.icon] : Home;

          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex h-full min-h-14 flex-col items-center justify-center gap-1 px-1 pt-2 pb-1.5',
                  'transition-colors duration-fast',
                  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-bloom-400',
                  active ? 'text-bloom-400' : 'text-mist-500 active:text-mist-200',
                )}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-linear-to-r from-bloom-400 to-orchid-400"
                  />
                )}
                <Icon className="size-5 shrink-0" aria-hidden />
                <span className="text-[10px] leading-none font-medium tracking-wide">
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}

        <li className="flex-1">
          <button
            type="button"
            onClick={onMore}
            aria-expanded={moreOpen}
            aria-haspopup="dialog"
            className={cn(
              'relative flex h-full min-h-14 w-full flex-col items-center justify-center gap-1 px-1 pt-2 pb-1.5',
              'transition-colors duration-fast',
              'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-bloom-400',
              moreOpen || onOverflowRoute ? 'text-bloom-400' : 'text-mist-500 active:text-mist-200',
            )}
          >
            {onOverflowRoute && (
              <span
                aria-hidden
                className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-linear-to-r from-bloom-400 to-orchid-400"
              />
            )}
            <MoreHorizontal className="size-5 shrink-0" aria-hidden />
            <span className="text-[10px] leading-none font-medium tracking-wide">Több</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
