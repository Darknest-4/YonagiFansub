'use client';

import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Bell,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
  Star,
  User as UserIcon,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/site/logo';
import { PRIMARY_NAV, SECONDARY_NAV, isActive } from '@/components/site/nav-config';
import { Avatar } from '@/components/ui/avatar';
import { Button, ButtonLink } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';
import { CommandPalette } from '@/components/site/command-palette';
import { apiFetch } from '@/lib/client/api';

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
export function SiteHeader({
  user,
  announcement,
}: {
  user: HeaderUser | null;
  announcement?: { text: string; href?: string } | null;
}) {
  const pathname = usePathname();
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
        <div className="relative z-50 bg-linear-100 from-tide-500/18 via-orchid-500/14 to-transparent">
          <div className="container-wide flex items-center justify-center gap-2 py-2 text-center text-xs text-mist-200 sm:text-sm">
            <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-tide-400" />
            {announcement.href ? (
              <Link
                href={announcement.href}
                className="underline-offset-4 transition-colors hover:text-tide-200 hover:underline"
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

          <nav aria-label="Fő navigáció" className="hidden lg:block">
            <ul className="flex items-center gap-1">
              {PRIMARY_NAV.map((item) => {
                const active = isActive(pathname, item);
                return (
                  <li key={item.href} className="relative">
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'relative block rounded-lg px-3.5 py-2 text-sm font-medium transition-colors duration-fast',
                        active ? 'text-mist-50' : 'text-mist-400 hover:text-mist-100',
                      )}
                    >
                      {item.label}
                      {active && (
                        <motion.span
                          layoutId="nav-active"
                          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                          className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-linear-to-r from-tide-400 to-orchid-400"
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
                'group hidden items-center gap-2.5 rounded-lg border border-ink-700/80 bg-ink-900/60 py-2 pr-2 pl-3',
                'text-sm text-mist-500 transition-colors duration-fast hover:border-ink-600 hover:text-mist-300 md:flex',
              )}
              aria-label="Keresés megnyitása"
            >
              <Search className="size-4" aria-hidden />
              <span className="pr-6">Keresés…</span>
              <kbd className="rounded border border-ink-700 bg-ink-850 px-1.5 py-0.5 font-mono text-[10px] text-mist-500">
                ⌘K
              </kbd>
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
                      className="ml-0.5 rounded-full transition-transform duration-fast hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide-400 motion-reduce:hover:scale-100"
                    >
                      <Avatar name={user.displayName} src={user.avatarUrl} size="md" />
                      <span className="sr-only">Fiók menü</span>
                    </button>
                  )}
                />
              </>
            ) : (
              <div className="hidden items-center gap-2 sm:flex">
                <ButtonLink href="/belepes" variant="ghost" size="sm">
                  Belépés
                </ButtonLink>
                <ButtonLink href="/regisztracio" variant="primary" size="sm">
                  Regisztráció
                </ButtonLink>
              </div>
            )}

            <Button
              variant="ghost"
              size="icon-sm"
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Menü megnyitása"
              aria-expanded={mobileOpen}
            >
              <Menu className="size-5" aria-hidden />
            </Button>
          </div>
        </div>
      </header>

      <MobileNav open={mobileOpen} onClose={() => setMobileOpen(false)} user={user} onLogout={handleLogout} />

      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}

function MobileNav({
  open,
  onClose,
  user,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
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
          aria-label="Navigációs menü"
        >
          <div className="absolute inset-0 bg-ink-950/85 backdrop-blur-sm" onClick={onClose} />

          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col border-l border-ink-800 bg-ink-925"
          >
            <div className="flex items-center justify-between border-b border-ink-800 px-5 py-4">
              <Logo size="sm" />
              <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Menü bezárása">
                <X className="size-5" aria-hidden />
              </Button>
            </div>

            <nav className="flex-1 overflow-y-auto overscroll-contain p-4" aria-label="Mobil navigáció">
              <ul className="space-y-1">
                {PRIMARY_NAV.map((item) => {
                  const active = isActive(pathname, item);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'block rounded-xl px-4 py-3.5 transition-colors duration-fast',
                          active
                            ? 'bg-tide-400/10 ring-1 ring-tide-400/25'
                            : 'hover:bg-ink-850 active:bg-ink-800',
                        )}
                      >
                        <span
                          className={cn(
                            'block text-base font-semibold',
                            active ? 'text-tide-200' : 'text-mist-100',
                          )}
                        >
                          {item.label}
                        </span>
                        {item.description && (
                          <span className="mt-0.5 block text-xs text-mist-500">
                            {item.description}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>

              <div className="my-4 h-px bg-ink-800" />

              <ul className="space-y-1">
                {SECONDARY_NAV.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="block rounded-xl px-4 py-3 text-sm text-mist-300 transition-colors duration-fast hover:bg-ink-850 hover:text-mist-100"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="border-t border-ink-800 p-4">
              {user ? (
                <div className="space-y-3">
                  <Link
                    href="/profil"
                    className="flex items-center gap-3 rounded-xl bg-ink-900 p-3 transition-colors hover:bg-ink-850"
                  >
                    <Avatar name={user.displayName} src={user.avatarUrl} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-mist-100">
                        {user.displayName}
                      </span>
                      <span className="block truncate text-xs text-mist-500">@{user.username}</span>
                    </span>
                  </Link>

                  {user.canAccessAdmin && (
                    <ButtonLink href="/admin" variant="secondary" size="sm" fullWidth>
                      Admin felület
                    </ButtonLink>
                  )}

                  <Button variant="ghost" size="sm" fullWidth onClick={onLogout}>
                    Kijelentkezés
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <ButtonLink href="/belepes" variant="secondary" size="md">
                    Belépés
                  </ButtonLink>
                  <ButtonLink href="/regisztracio" variant="primary" size="md">
                    Regisztráció
                  </ButtonLink>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
