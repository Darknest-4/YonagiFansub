/**
 * Navigation model.
 *
 * A single declaration drives the desktop bar, the mobile sheet, the footer and
 * the sitemap. Adding a page means adding a line here, not touching four files
 * that then drift apart.
 */

export interface NavItem {
  href: string;
  label: string;
  /** Shown in the mobile sheet under the label. */
  description?: string;
  /** Matches child routes too, e.g. `/projektek/steins-gate`. */
  matchPrefix?: boolean;
}

export const PRIMARY_NAV: NavItem[] = [
  {
    href: '/projektek',
    label: 'Projektek',
    description: 'Minden sorozat és film, amin dolgozunk',
    matchPrefix: true,
  },
  {
    href: '/kiadasok',
    label: 'Kiadások',
    description: 'A legfrissebb epizódok és batch-ek',
    matchPrefix: true,
  },
  {
    href: '/hirek',
    label: 'Hírek',
    description: 'Bejelentések és csapathírek',
    matchPrefix: true,
  },
  {
    href: '/csapat',
    label: 'Csapat',
    description: 'Akik a feliratok mögött állnak',
    matchPrefix: true,
  },
];

export const SECONDARY_NAV: NavItem[] = [
  { href: '/gyik', label: 'GYIK', description: 'Gyakori kérdések' },
  { href: '/kapcsolat', label: 'Kapcsolat', description: 'Írj nekünk' },
];

export const FOOTER_SECTIONS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: 'Tartalom',
    items: [
      { href: '/projektek', label: 'Projektek' },
      { href: '/kiadasok', label: 'Legújabb kiadások' },
      { href: '/hirek', label: 'Hírek' },
      { href: '/kereses', label: 'Keresés' },
    ],
  },
  {
    title: 'Csapat',
    items: [
      { href: '/csapat', label: 'Csapattagok' },
      { href: '/csatlakozz', label: 'Csatlakozz hozzánk' },
      { href: '/kapcsolat', label: 'Kapcsolat' },
      { href: '/gyik', label: 'GYIK' },
    ],
  },
  {
    title: 'Fiók',
    items: [
      { href: '/belepes', label: 'Bejelentkezés' },
      { href: '/regisztracio', label: 'Regisztráció' },
      { href: '/profil', label: 'Profil' },
      { href: '/profil/beallitasok', label: 'Beállítások' },
    ],
  },
  {
    title: 'Jogi',
    items: [
      { href: '/adatkezeles', label: 'Adatkezelés' },
      { href: '/felhasznalasi-feltetelek', label: 'Felhasználási feltételek' },
      { href: '/dmca', label: 'Jogi nyilatkozat' },
    ],
  },
];

export function isActive(pathname: string, item: NavItem): boolean {
  if (item.href === '/') return pathname === '/';
  return item.matchPrefix ? pathname.startsWith(item.href) : pathname === item.href;
}
