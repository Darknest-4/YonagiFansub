'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import * as Icons from 'lucide-react';
import { ExternalLink, LogOut, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/site/logo';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';
import { ADMIN_NAV, type AdminNavItem } from '@/components/admin/admin-nav-config';
import { apiFetch } from '@/lib/client/api';

export interface AdminShellUser {
  displayName: string;
  username: string;
  avatarUrl: string | null;
  roleName: string;
  roleColor: string | null;
  permissions: string[];
}

export interface AdminBadges {
  contact: number;
  comments: number;
}

/**
 * Admin shell.
 *
 * A persistent sidebar on desktop, a slide-over drawer below `lg`. The
 * navigation is filtered by the actor's permissions before it is rendered, so a
 * moderator's sidebar contains only what a moderator can actually open.
 *
 * The admin panel gets its own visual register — denser, quieter, warmer greys
 * than the public site — so it is never ambiguous which surface you are on.
 */
export function AdminShell({
  user,
  badges,
  children,
}: {
  user: AdminShellUser;
  badges: AdminBadges;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => setDrawerOpen(false), [pathname]);

  const can = (permission: string) =>
    user.permissions.includes('*') || user.permissions.includes(permission);

  const sections = ADMIN_NAV.map((section) => ({
    ...section,
    items: section.items.filter((item) => can(item.permission)),
  })).filter((section) => section.items.length > 0);

  const logout = async () => {
    await apiFetch('/api/v1/auth/logout', { method: 'POST' }).catch(() => undefined);
    window.location.assign('/');
  };

  const sidebar = (
    <nav aria-label="Admin navigáció" className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-ink-800 px-5">
        <Logo size="sm" href="/admin" />
        <span className="rounded-md bg-orchid-400/12 px-2 py-0.5 text-[10px] font-bold tracking-wider text-orchid-300 uppercase">
          Admin
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {sections.map((section) => (
          <div key={section.title} className="mb-5">
            <h2 className="mb-1.5 px-3 text-[10px] font-bold tracking-[0.16em] text-mist-600 uppercase">
              {section.title}
            </h2>
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.href}>
                  <NavLink item={item} pathname={pathname} badges={badges} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="shrink-0 border-t border-ink-800 p-3">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-mist-400 transition-colors hover:bg-ink-850 hover:text-mist-100"
        >
          <ExternalLink className="size-4 shrink-0" aria-hidden />
          Nyilvános oldal
        </Link>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-dvh bg-ink-950">
      <aside className="hidden w-64 shrink-0 border-r border-ink-800 bg-ink-925 lg:block">
        <div className="sticky top-0 h-dvh">{sidebar}</div>
      </aside>

      <AnimatePresence>
        {drawerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-90 lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Admin menü"
          >
            <div
              className="absolute inset-0 bg-ink-950/85 backdrop-blur-sm"
              onClick={() => setDrawerOpen(false)}
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-y-0 left-0 w-72 border-r border-ink-800 bg-ink-925"
            >
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Menü bezárása"
                className="absolute top-4 right-3 rounded-md p-2 text-mist-400 hover:bg-ink-850 hover:text-mist-100"
              >
                <X className="size-4" aria-hidden />
              </button>
              {sidebar}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-3 border-b border-ink-800 bg-ink-950/90 px-4 backdrop-blur-lg sm:px-6">
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={() => setDrawerOpen(true)}
            aria-label="Menü megnyitása"
          >
            <Menu className="size-5" aria-hidden />
          </Button>

          <Breadcrumb pathname={pathname} />

          <div className="ml-auto flex items-center gap-3">
            <span
              className="hidden rounded-md px-2.5 py-1 text-2xs font-medium sm:block"
              style={{
                color: user.roleColor ?? '#8f9bbd',
                backgroundColor: `color-mix(in oklab, ${user.roleColor ?? '#8f9bbd'} 12%, transparent)`,
              }}
            >
              {user.roleName}
            </span>

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
                { key: 'profile', label: 'Saját profil', href: '/profil' },
                { key: 'site', label: 'Nyilvános oldal', href: '/' },
                {
                  key: 'logout',
                  label: 'Kijelentkezés',
                  onSelect: logout,
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
                  className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bloom-400"
                >
                  <Avatar name={user.displayName} src={user.avatarUrl} size="sm" />
                  <span className="sr-only">Fiók menü</span>
                </button>
              )}
            />
          </div>
        </header>

        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function NavLink({
  item,
  pathname,
  badges,
}: {
  item: AdminNavItem;
  pathname: string;
  badges: AdminBadges;
}) {
  const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);

  // The nav config stores icon names as strings so it can stay a plain data
  // module importable from the server; the lookup happens here, on the client.
  const Icon = (Icons[item.icon as keyof typeof Icons] ??
    Icons.Circle) as React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;

  const count = item.badge ? badges[item.badge] : 0;

  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-fast',
        active
          ? 'bg-bloom-400/12 text-bloom-200'
          : 'text-mist-400 hover:bg-ink-850 hover:text-mist-100',
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {count > 0 && (
        <span className="nums shrink-0 rounded-full bg-ember-400 px-1.5 text-[10px] font-bold text-ink-950">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}

/** Derives a readable trail from the pathname – no per-page wiring required. */
function Breadcrumb({ pathname }: { pathname: string }) {
  const labels: Record<string, string> = {
    admin: 'Vezérlőpult',
    projektek: 'Projektek',
    hirek: 'Hírek',
    csapat: 'Csapat',
    uzenetek: 'Üzenetek',
    hozzaszolasok: 'Hozzászólások',
    felhasznalok: 'Felhasználók',
    szerepkorok: 'Szerepkörök',
    beallitasok: 'Beállítások',
    naplo: 'Audit napló',
    statisztika: 'Statisztika',
    media: 'Médiatár',
    gyik: 'GYIK',
    videoszolgaltatok: 'Videó-szolgáltatók',
    import: 'Anime importálás',
    uj: 'Új',
  };

  const parts = pathname.split('/').filter(Boolean);

  return (
    <nav aria-label="Hol vagyok" className="min-w-0">
      <ol className="flex items-center gap-1.5 text-sm">
        {parts.map((part, index) => {
          const last = index === parts.length - 1;
          const href = `/${parts.slice(0, index + 1).join('/')}`;
          // Unknown segments are ids; showing a truncated id is more honest than
          // inventing a label for it.
          const label = labels[part] ?? (part.length > 12 ? 'Szerkesztés' : part);

          return (
            <li key={href} className="flex min-w-0 items-center gap-1.5">
              {index > 0 && (
                <span aria-hidden className="text-mist-600">
                  /
                </span>
              )}
              {last ? (
                <span aria-current="page" className="truncate font-medium text-mist-100">
                  {label}
                </span>
              ) : (
                <Link href={href} className="truncate text-mist-500 hover:text-mist-300">
                  {label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
