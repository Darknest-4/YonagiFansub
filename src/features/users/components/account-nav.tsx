'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, ListChecks, Settings, Star, User } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: typeof User;
  /** `/profil` must match exactly, or every sub-page would light it up too. */
  exact?: boolean;
}

const ITEMS: NavItem[] = [
  { href: '/profil', label: 'Áttekintés', icon: User, exact: true },
  { href: '/profil/nezesi-lista', label: 'Nézési lista', icon: ListChecks },
  { href: '/profil/kedvencek', label: 'Kedvencek', icon: Star },
  { href: '/profil/ertesitesek', label: 'Értesítések', icon: Bell },
  { href: '/profil/beallitasok', label: 'Beállítások', icon: Settings },
];

/**
 * Account sub-navigation.
 *
 * A vertical list on desktop, a horizontal scrolling rail on mobile — the same
 * markup either way, so there is only one set of active-state rules to keep
 * correct.
 */
export function AccountNav() {
  const pathname = usePathname();

  return (
    /*
      `min-w-0` is load-bearing, not tidying.

      This nav is a grid item in the account layout, and a grid item defaults to
      `min-width: auto` — it refuses to shrink below its content. The four tabs
      come to about 530px, so on a phone the column became 530px wide, the page
      picked up 140px of horizontal scroll, and the `overflow-x-auto` below never
      got the chance to do its job: the rail was never narrower than its content,
      so there was nothing to scroll.

      The symptom is easy to misread, too. On mobile the layout viewport widens
      to fit the overflow, and the fixed bottom bar stretches with it — so the
      thing that *looks* broken is the tab bar, several components away from the
      cause.
    */
    <nav aria-label="Fiók navigáció" className="min-w-0">
      <ul className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0">
        {ITEMS.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <li key={item.href} className="shrink-0 lg:shrink">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-sm font-medium whitespace-nowrap',
                  'transition-colors duration-fast',
                  active
                    ? 'bg-bloom-400/12 text-bloom-200 ring-1 ring-bloom-400/25'
                    : 'text-mist-400 hover:bg-ink-850 hover:text-mist-100',
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
