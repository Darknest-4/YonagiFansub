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
  /**
   * Lucide icon name for the mobile tab bar. Kept as a string so this module
   * stays free of React imports and can be used by the sitemap and the footer,
   * neither of which renders an icon.
   */
  icon?: 'Home' | 'Clapperboard' | 'Package' | 'Newspaper' | 'Users' | 'HelpCircle' | 'Mail' | 'Sparkles' | 'CalendarDays';
  /**
   * Whether this item earns a slot in the mobile tab bar. Five is the ceiling:
   * a sixth tab on a 360px screen drops each target under the width a thumb can
   * reliably hit, and the rest are one tap away behind "Több".
   */
  tab?: boolean;
}

/**
 * A teljes fősor. A GYIK és a Kapcsolat is itt van, nem egy másodlagos
 * csoportban: hét elem még kényelmesen elfér egy 1440-es sávban, és egy fansub
 * oldalon pont ez a kettő az, amit a látogatók keresnek — elrejteni őket egy
 * „több" menü mögé az ő dolgukat nehezítené a mi rendezettségünkért.
 */
export const PRIMARY_NAV: NavItem[] = [
  {
    href: '/',
    label: 'Kezdőlap',
    icon: 'Home',
    tab: true,
    description: 'Friss kiadások és hírek',
  },
  {
    href: '/projektek',
    label: 'Projektek',
    icon: 'Clapperboard',
    tab: true,
    description: 'Minden sorozat és film, amin dolgozunk',
    matchPrefix: true,
  },
  {
    href: '/kiadasok',
    label: 'Kiadások',
    icon: 'Package',
    tab: true,
    description: 'A legfrissebb epizódok és batch-ek',
    matchPrefix: true,
  },
  {
    href: '/naptar',
    label: 'Naptár',
    icon: 'CalendarDays',
    description: 'Mikor jön a következő rész',
  },
  {
    href: '/hirek',
    label: 'Hírek',
    icon: 'Newspaper',
    tab: true,
    description: 'Bejelentések és csapathírek',
    matchPrefix: true,
  },
  {
    href: '/csapat',
    label: 'Csapat',
    icon: 'Users',
    description: 'Akik a feliratok mögött állnak',
    matchPrefix: true,
  },
  { href: '/gyik', label: 'GYIK', description: 'Gyakori kérdések', icon: 'HelpCircle' },
  { href: '/kapcsolat', label: 'Kapcsolat', description: 'Írj nekünk', icon: 'Mail' },
];

/**
 * A mobil lap alján megjelenő másodlagos hivatkozások. Nem duplikálja a
 * fősort — az ott már látszik.
 */
export const SECONDARY_NAV: NavItem[] = [
  {
    href: '/csatlakozz',
    label: 'Csatlakozz',
    description: 'Keresünk fordítót, lektort, formázót',
    icon: 'Sparkles',
  },
];

export const FOOTER_SECTIONS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: 'Tartalom',
    items: [
      { href: '/projektek', label: 'Projektek' },
      { href: '/kiadasok', label: 'Legújabb kiadások' },
      { href: '/naptar', label: 'Adásnaptár' },
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

/** The primary items that get a slot in the mobile tab bar. */
export const TAB_NAV: NavItem[] = PRIMARY_NAV.filter((item) => item.tab);

/** Everything the tab bar could not fit, surfaced behind the "Több" sheet. */
export const OVERFLOW_NAV: NavItem[] = [
  ...PRIMARY_NAV.filter((item) => !item.tab),
  ...SECONDARY_NAV,
];
