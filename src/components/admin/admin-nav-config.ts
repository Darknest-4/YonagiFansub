import type { Permission } from '@/lib/auth/permissions';

/**
 * Admin navigation.
 *
 * Each entry declares the permission it needs. The sidebar filters itself
 * against the actor's permissions, so a moderator simply never sees the settings
 * link — and the page behind it enforces the same permission independently, so
 * hiding the link is a UX nicety rather than the access control.
 */

export interface AdminNavItem {
  href: string;
  label: string;
  icon: string;
  permission: Permission;
  exact?: boolean;
  /** Key into the badge counts the shell loads (e.g. unread contact messages). */
  badge?: 'contact' | 'comments';
}

export interface AdminNavSection {
  title: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV: AdminNavSection[] = [
  {
    title: 'Áttekintés',
    items: [
      {
        href: '/admin',
        label: 'Vezérlőpult',
        icon: 'LayoutDashboard',
        permission: 'admin:access',
        exact: true,
      },
      { href: '/admin/statisztika', label: 'Statisztika', icon: 'BarChart3', permission: 'stats:read' },
    ],
  },
  {
    title: 'Katalógus',
    items: [
      { href: '/admin/projektek', label: 'Projektek', icon: 'Clapperboard', permission: 'project:read' },
      {
        href: '/admin/projektek/import',
        label: 'Anime importálás',
        icon: 'Download',
        permission: 'project:write',
      },
      { href: '/admin/videok', label: 'Videóforrások', icon: 'Film', permission: 'episode:write' },
      {
        href: '/admin/videoszolgaltatok',
        label: 'Videó-szolgáltatók',
        icon: 'MonitorPlay',
        permission: 'episode:write',
      },
    ],
  },
  {
    title: 'Tartalom',
    items: [
      { href: '/admin/hirek', label: 'Hírek', icon: 'Newspaper', permission: 'news:write' },
      { href: '/admin/csapat', label: 'Csapat', icon: 'Users', permission: 'team:write' },
      { href: '/admin/media', label: 'Médiatár', icon: 'Images', permission: 'media:write' },
      { href: '/admin/gyik', label: 'GYIK', icon: 'HelpCircle', permission: 'faq:write' },
    ],
  },
  {
    title: 'Közösség',
    items: [
      {
        href: '/admin/uzenetek',
        label: 'Üzenetek',
        icon: 'Mail',
        permission: 'contact:read',
        badge: 'contact',
      },
      {
        href: '/admin/hozzaszolasok',
        label: 'Hozzászólások',
        icon: 'MessageSquare',
        permission: 'comment:moderate',
        badge: 'comments',
      },
    ],
  },
  {
    title: 'Rendszer',
    items: [
      { href: '/admin/felhasznalok', label: 'Felhasználók', icon: 'UserCog', permission: 'user:read' },
      { href: '/admin/szerepkorok', label: 'Szerepkörök', icon: 'ShieldCheck', permission: 'role:manage' },
      { href: '/admin/beallitasok', label: 'Beállítások', icon: 'Settings', permission: 'settings:read' },
      { href: '/admin/naplo', label: 'Audit napló', icon: 'ScrollText', permission: 'audit:read' },
    ],
  },
];
