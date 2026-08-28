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
    description: 'Friss kiadások és hírek',
  },
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
  { href: '/gyik', label: 'GYIK', description: 'Gyakori kérdések' },
  { href: '/kapcsolat', label: 'Kapcsolat', description: 'Írj nekünk' },
];

/**
 * A mobil lap alján megjelenő másodlagos hivatkozások. Nem duplikálja a
 * fősort — az ott már látszik.
 */
export const SECONDARY_NAV: NavItem[] = [
  { href: '/csatlakozz', label: 'Csatlakozz', description: 'Keresünk fordítót, lektort, formázót' },
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
