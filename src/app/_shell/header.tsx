'use client';

import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Bell,
  CalendarDays,
  ChevronRight,
  Clapperboard,
  HelpCircle,
  Home,
  LayoutDashboard,
  LogIn,
  LogOut,
  Mail,
  Newspaper,
  Package,
  ScrollText,
  Search,
  Settings,
  Sparkles,
  Star,
  User as UserIcon,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Logo } from '@/shared/ui/logo';
import {
  OVERFLOW_NAV,
  PRIMARY_NAV,
  TAB_NAV,
  isActive,
  visibleNav,
  type NavFeature,
  type NavItem,
} from '@/app/_shell/nav-config';
import { MobileTabBar } from '@/app/_shell/mobile-tab-bar';
import { Avatar } from '@/shared/ui/avatar';
import { Button, ButtonLink } from '@/shared/ui/button';
import { Dropdown } from '@/shared/ui/dropdown';
import { CommandPalette } from '@/features/search/components/command-palette';
import { apiFetch } from '@/shared/api/client';

export interface HeaderUser {
  displayName: string;
  username: string;
  avatarUrl: string | null;
  canAccessAdmin: boolean;
  unreadCount: number;
}

/**
 * Site header.
 *
 * Behaviours worth noting:
 *   • Transparent over the hero, then condenses to a bordered glass bar once the
 *     page scrolls — the brand gets the full-bleed moment without ever losing
 *     the navigation.
 *   • The active-route indicator is a shared `layoutId`, so it slides between
 *     items instead of blinking.
 *   • The mobile sheet is a full-height panel with real focus management and a
 *     body scroll lock; it closes on navigation.
 */
/**
 * Icon and colour for a row in the "Több" sheet.
 *
 * A list of identical grey rows is read word by word. A fixed colour and shape
 * per destination makes it findable before the label is parsed, which is the
 * only reason to put icons in a menu at all — decoration would not be worth the
 * vertical space each row then costs.
 */
const SHEET_ICONS: Record<NonNullable<NavItem['icon']>, LucideIcon> = {
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

const SHEET_TINTS: Record<NonNullable<NavItem['tint']>, string> = {
  bloom: 'bg-bloom-500/12 text-bloom-300',
  orchid: 'bg-orchid-500/12 text-orchid-300',
  info: 'bg-info-500/12 text-info-400',
  success: 'bg-success-500/12 text-success-400',
  warm: 'bg-ember-500/12 text-ember-300',
  sakura: 'bg-sakura-500/12 text-sakura-300',
};

export function SiteHeader({
  user,
  announcement,
  disabledNav = [],
}: {
  user: HeaderUser | null;
  announcement?: { text: string; href?: string } | null;
  /**
   * Features switched off in the settings. Their menu entries are removed here
   * rather than in `nav-config`, which is a plain module shared with the
   * sitemap and cannot read the database.
   */
  disabledNav?: NavFeature[];
}) {
  const pathname = usePathname();

  const primaryNav = visibleNav(PRIMARY_NAV, disabledNav);
  const tabNav = visibleNav(TAB_NAV, disabledNav);
  const overflowNav = visibleNav(OVERFLOW_NAV, disabledNav);
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close the sheet whenever the route changes.
  useEffect(() => setMobileOpen(false), [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  // ⌘K / Ctrl-K opens search from anywhere.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleLogout = async () => {
    await apiFetch('/api/v1/auth/logout', { method: 'POST' }).catch(() => undefined);
    window.location.assign('/');
  };

  return (
    <>
      {announcement?.text && (
        <div className="relative z-50 bg-linear-100 from-bloom-500/18 via-orchid-500/14 to-transparent">
          <div className="container-wide flex items-center justify-center gap-2 py-2 text-center text-xs text-mist-200 sm:text-sm">
            <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-bloom-400" />
            {announcement.href ? (
              <Link
                href={announcement.href}
                className="underline-offset-4 transition-colors hover:text-bloom-200 hover:underline"
              >
                {announcement.text}
              </Link>
            ) : (
              <span>{announcement.text}</span>
            )}
          </div>
        </div>
      )}

      <header
        className={cn(
          'sticky top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-base ease-out-quint',
          scrolled
            ? 'border-b border-ink-800/80 bg-ink-950/85 backdrop-blur-xl'
            : 'border-b border-transparent bg-transparent',
        )}
      >
        <div className="container-wide flex h-16 items-center justify-between gap-4 lg:h-18">
          <Logo />

          {/*
            Nagybetűs, ritkított navigáció: hét rövid magyar szó kisbetűvel
            egymás mellett összefolyik, a nagybetű és a betűköz viszont ritmust
            ad neki, és a mark tipográfiájával is egy nyelvet beszél.
          */}
          <nav aria-label="Fő navigáció" className="hidden lg:block">
            <ul className="flex items-center gap-0.5">
              {primaryNav.map((item) => {
                const active = isActive(pathname, item);
                return (
                  <li key={item.href} className="relative">
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'relative block px-3.5 py-5 text-2xs font-semibold tracking-[0.14em] uppercase',
                        'transition-colors duration-fast',
                        active ? 'text-bloom-400' : 'text-mist-300 hover:text-mist-50',
                      )}
                    >
                      {item.label}
                      {active && (
                        <motion.span
                          layoutId="nav-active"
                          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                          className="absolute inset-x-3.5 bottom-0 h-0.5 rounded-full bg-bloom-500"
                        />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className={cn(
                'group hidden w-56 items-center gap-2 rounded-full border border-ink-700/80 bg-ink-900/60 py-2 pr-2 pl-4 xl:w-64',
                'text-sm text-mist-500 transition-colors duration-fast hover:border-bloom-500/40 hover:text-mist-300 md:flex',
              )}
              aria-label="Keresés megnyitása"
            >
              <span className="flex-1 text-left">Keresés…</span>
              <kbd className="hidden rounded border border-ink-700 bg-ink-850 px-1.5 py-0.5 font-mono text-[10px] text-mist-500 xl:block">
                ⌘K
              </kbd>
              <Search className="size-4 shrink-0 text-mist-400" aria-hidden />
            </button>

            <Button
              variant="ghost"
              size="icon-sm"
              className="md:hidden"
              onClick={() => setSearchOpen(true)}
              aria-label="Keresés"
            >
              <Search className="size-4.5" aria-hidden />
            </Button>

            {user ? (
              <>
                <Link
                  href="/profil/ertesitesek"
                  aria-label={
                    user.unreadCount > 0
                      ? `Értesítések (${user.unreadCount} olvasatlan)`
                      : 'Értesítések'
                  }
                  className="relative hidden rounded-md p-2 text-mist-400 transition-colors duration-fast hover:bg-ink-800 hover:text-mist-100 sm:block"
                >
                  <Bell className="size-4.5" aria-hidden />
                  {user.unreadCount > 0 && (
                    <span className="nums absolute -top-0.5 -right-0.5 grid min-w-4.5 place-items-center rounded-full bg-ember-400 px-1 text-[10px] font-bold text-ink-950">
                      {user.unreadCount > 9 ? '9+' : user.unreadCount}
                    </span>
                  )}
                </Link>

                <Dropdown
                  align="end"
                  header={
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-mist-100">
                        {user.displayName}
                      </p>
                      <p className="truncate text-xs text-mist-500">@{user.username}</p>
                    </div>
                  }
                  items={[
                    { key: 'profile', label: 'Profilom', href: '/profil', icon: <UserIcon className="size-4" /> },
                    { key: 'favorites', label: 'Kedvenceim', href: '/profil/kedvencek', icon: <Star className="size-4" /> },
                    { key: 'settings', label: 'Beállítások', href: '/profil/beallitasok', icon: <Settings className="size-4" /> },
                    ...(user.canAccessAdmin
                      ? [
                          {
                            key: 'admin',
                            label: 'Admin felület',
                            href: '/admin',
                            icon: <LayoutDashboard className="size-4" />,
                            separated: true,
                          },
                        ]
                      : []),
                    {
                      key: 'logout',
                      label: 'Kijelentkezés',
                      onSelect: handleLogout,
                      icon: <LogOut className="size-4" />,
                      tone: 'danger' as const,
                      separated: true,
                    },
                  ]}
                  trigger={({ toggle, open, id }) => (
                    <button
                      id={id}
                      type="button"
                      onClick={toggle}
                      aria-haspopup="menu"
                      aria-expanded={open}
                      className="ml-0.5 rounded-full transition-transform duration-fast hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bloom-400 motion-reduce:hover:scale-100"
                    >
                      <Avatar name={user.displayName} src={user.avatarUrl} size="md" />
                      <span className="sr-only">Fiók menü</span>
                    </button>
                  )}
                />
              </>
            ) : (
              // Egyetlen elsődleges gomb a fejlécben. A regisztráció a
              // belépőoldalról egy kattintás, és két egyforma súlyú gomb egymás
              // mellett csak elveszi a döntést attól, aki már tag.
              <ButtonLink
                href="/belepes"
                variant="primary"
                size="sm"
                className="hidden text-2xs tracking-[0.12em] uppercase sm:inline-flex"
              >
                Bejelentkezés
              </ButtonLink>
            )}

          </div>
        </div>
      </header>

      <MobileTabBar tabs={tabNav} onMore={() => setMobileOpen(true)} moreOpen={mobileOpen} />

      <MobileNav
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        items={overflowNav}
        user={user}
        onLogout={handleLogout}
      />

      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}

function MobileNav({
  open,
  onClose,
  items,
  user,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
  items: NavItem[];
  user: HeaderUser | null;
  onLogout: () => void;
}) {
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-90 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="További menüpontok"
        >
          <div className="absolute inset-0 bg-ink-950/85 backdrop-blur-sm" onClick={onClose} />

          {/*
            A bottom sheet rather than a side drawer: it is opened from the
            "Több" tab at the bottom of the screen, and a panel that flies in
            from the opposite edge breaks the link between what you pressed and
            what appeared. It also lands where the thumb already is.
          */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-[1.75rem] border-t border-ink-800 bg-ink-925 pb-[env(safe-area-inset-bottom)]"
          >
            {/*
              A grab handle. It does not drag — the sheet closes by tapping the
              backdrop or the X — but it is the near-universal sign that a panel
              came up from the bottom edge and can be sent back, and people reach
              for the backdrop once they read it as one.
            */}
            <div aria-hidden className="flex justify-center pt-3 pb-1">
              <span className="h-1 w-10 rounded-full bg-ink-700" />
            </div>

            <div className="flex items-center justify-between px-5 pt-2 pb-4">
              <h2 className="text-2xl font-bold text-mist-50">Menü</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Menü bezárása"
                className="grid size-9 place-items-center rounded-full bg-ink-850 text-mist-300 transition-colors hover:bg-ink-800 active:bg-ink-750 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bloom-400"
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>

            <nav
              className="flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 pb-4"
              aria-label="További menüpontok"
            >
              {/*
                The account card sits above the destinations rather than at the
                bottom of the sheet, because for a signed-out visitor it is the
                most consequential thing here — half the site's features are
                behind it — and a call to action below the fold of a scrolling
                panel is one nobody sees.
              */}
              {user ? (
                <Link
                  href="/profil"
                  className="flex items-center gap-3 rounded-2xl bg-ink-900 p-3.5 transition-colors hover:bg-ink-850 active:bg-ink-800"
                >
                  <Avatar name={user.displayName} src={user.avatarUrl} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-bold text-mist-50">
                      {user.displayName}
                    </span>
                    <span className="block truncate text-xs text-mist-500">@{user.username}</span>
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-mist-600" aria-hidden />
                </Link>
              ) : (
                <div className="flex items-center gap-3 rounded-2xl bg-ink-900 p-3.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-bold text-mist-50">Üdvözöllek!</span>
                    <span className="block text-xs text-mist-500">
                      Jelentkezz be a teljes élményért
                    </span>
                  </span>
                  <Link
                    href="/belepes"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-mist-50 px-4 py-2.5 text-sm font-bold text-ink-950 transition-colors hover:bg-white active:bg-mist-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bloom-400"
                  >
                    <LogIn className="size-4" aria-hidden />
                    Belépés
                  </Link>
                </div>
              )}

              {/*
                Only what the tab bar could not fit. Repeating the six tabs two
                centimetres above themselves would pad the sheet without adding a
                single destination.
              */}
              <ul className="space-y-2 pt-1">
                {items.map((item) => {
                  const active = isActive(pathname, item);
                  const Icon = item.icon ? SHEET_ICONS[item.icon] : Sparkles;
                  const tint = SHEET_TINTS[item.tint ?? 'bloom'];

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex items-center gap-3.5 rounded-2xl px-3.5 py-3 transition-colors duration-fast',
                          active
                            ? 'bg-bloom-400/10 ring-1 ring-bloom-400/25'
                            : 'bg-ink-900/70 hover:bg-ink-850 active:bg-ink-800',
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn('grid size-11 shrink-0 place-items-center rounded-xl', tint)}
                        >
                          <Icon className="size-5" />
                        </span>

                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              'block truncate text-base font-bold',
                              active ? 'text-bloom-200' : 'text-mist-50',
                            )}
                          >
                            {item.label}
                          </span>
                          {item.description && (
                            <span className="mt-0.5 block truncate text-xs text-mist-500">
                              {item.description}
                            </span>
                          )}
                        </span>

                        <ChevronRight className="size-5 shrink-0 text-mist-600" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            {/*
              Actions, not destinations. The account itself moved to the card at
              the top of the sheet; what is left down here is the pair of things
              you do *to* a session rather than places you go, which is why they
              are buttons and why they sit apart from the list.
            */}
            {user && (
              <div className="flex gap-2 border-t border-ink-800 p-4">
                {user.canAccessAdmin && (
                  <ButtonLink href="/admin" variant="secondary" size="sm" fullWidth>
                    Admin felület
                  </ButtonLink>
                )}
                <Button variant="ghost" size="sm" fullWidth onClick={onLogout}>
                  Kijelentkezés
                </Button>
              </div>
            )}

            {!user && (
              <div className="border-t border-ink-800 p-4">
                <ButtonLink href="/regisztracio" variant="primary" size="md" fullWidth>
                  Regisztráció
                </ButtonLink>
              </div>
            )}

          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
