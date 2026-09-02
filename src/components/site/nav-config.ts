/**
 * Navigation model.
 *
 * A single declaration drives the desktop bar, the mobile sheet, the footer and
 * the sitemap. Adding a page means adding a line here, not touching four files
 * that then drift apart.
 */

/** Destinations a site setting can remove from the menus. */
export type NavFeature = 'schedule' | 'changelog';

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
  icon?:
    | 'Home'
    | 'Clapperboard'
    | 'Package'
    | 'Newspaper'
    | 'Users'
    | 'HelpCircle'
    | 'Mail'
    | 'Sparkles'
    | 'CalendarDays'
    | 'ScrollText';
  /**
   * The site setting that switches this destination off.
   *
   * A page that 404s must not still be listed in three menus — that is a dead
   * link the team put there on purpose, which is worse than a broken one. The
   * entry names the feature; the layout reads the settings and hands down which
   * features are off, because `nav-config` is imported by client components and
   * has no business touching the database.
   */
  feature?: NavFeature;
  /**
   * Hue for the icon tile in the "Több" sheet.
   *
   * A row of identical grey squares is a list you scan word by word; giving each
   * destination a fixed colour makes it findable by shape before the label is
   * read, which is the whole point of putting icons there at all. Fixed per
   * entry rather than derived, so a menu item does not change colour when
   * another one is inserted above it.
   */
  tint?: 'bloom' | 'orchid' | 'info' | 'success' | 'warm' | 'sakura';
  /**
   * Whether this item earns a slot in the mobile tab bar. Six is the measured
   * ceiling: 49px per target at 320px and 57px at 390px, with no label
   * truncated — a seventh would drop under the 44px a thumb reliably hits. The
   * rest are one tap away behind "Több".
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
    description: 'Friss részek és hírek',
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
    href: '/naptar',
    label: 'Naptár',
    icon: 'CalendarDays',
    tab: true,
    description: 'Mikor jön a következő rész',
    feature: 'schedule',
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
    // Feljebb lépett a tab sávba, amikor a „Kiadások” megszűnt: a mért plafon
    // hat célpont, és öt helyet hagyni üresen nem takarít meg semmit.
    tab: true,
    tint: 'orchid',
    description: 'Akik a feliratok mögött állnak',
    matchPrefix: true,
  },
  {
    href: '/gyik',
    label: 'GYIK',
    description: 'Gyakori kérdések',
    icon: 'HelpCircle',
    tint: 'warm',
  },
  { href: '/kapcsolat', label: 'Kapcsolat', description: 'Írj nekünk', icon: 'Mail', tint: 'info' },
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
    tint: 'sakura',
  },
  {
    href: '/fejlesztes',
    label: 'Fejlesztési napló',
    description: 'Mi épült meg, és mikor',
    icon: 'ScrollText',
    tint: 'success',
    feature: 'changelog',
  },
];

export const FOOTER_SECTIONS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: 'Tartalom',
    items: [
      { href: '/projektek', label: 'Projektek' },
      { href: '/naptar', label: 'Adásnaptár', feature: 'schedule' },
      { href: '/hirek', label: 'Hírek' },
      { href: '/kereses', label: 'Keresés' },
    ],
  },
  {
    title: 'Csapat',
    items: [
      { href: '/csapat', label: 'Csapattagok' },
      { href: '/csatlakozz', label: 'Csatlakozz hozzánk' },
      { href: '/fejlesztes', label: 'Fejlesztési napló', feature: 'changelog' },
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

/**
 * Drops the entries whose feature is switched off.
 *
 * Takes the *disabled* set rather than the enabled one on purpose: an entry
 * with no `feature` at all is always shown, and an entry naming a feature
 * nobody passed is shown too. Adding a menu item can therefore never make it
 * silently invisible — the failure mode of the inverse (list what is on) is a
 * page that disappears because somebody forgot to add its name to a list.
 */
export function visibleNav<T extends NavItem>(items: T[], off: readonly NavFeature[]): T[] {
  if (off.length === 0) return items;
  return items.filter((item) => !item.feature || !off.includes(item.feature));
}

/**
 * Reads the settings into the disabled list.
 *
 * A pure function taking a plain object rather than calling `getSettings()`
 * itself, because this module is imported by client components: it has to stay
 * free of `server-only` and of the database. The header, the footer and the
 * sitemap each pass in the settings they already loaded.
 *
 * `!== false` rather than a truthiness check — a key missing from the object
 * means "not told", and the honest reading of that is the feature's default,
 * which for both of these is on. Only an explicit `false` hides a page.
 */
export function disabledNavFeatures(settings: {
  scheduleEnabled?: boolean;
  changelogEnabled?: boolean;
}): NavFeature[] {
  const off: NavFeature[] = [];
  if (settings.scheduleEnabled === false) off.push('schedule');
  if (settings.changelogEnabled === false) off.push('changelog');
  return off;
}
