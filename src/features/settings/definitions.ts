/**
 * Az oldal beállításainak deklarációja.
 *
 * Ez a tábla a szerződés: a kulcs, a típusa, az alapértéke, és hogy kimehet-e
 * a böngészőbe. Külön fájlban van a betöltéstől, mert más ütemben változik —
 * új beállítás hetente kerülhet be, a betöltés logikája évekig nem.
 *
 * Az `isPublic` dönti el, hogy egy érték szerializálható-e a böngészőnek.
 * Ami üzemeltetési (webhookok, moderálási küszöbök), az szerveroldalon marad.
 */

export interface SettingDefinition<T> {
  key: string;
  group: 'general' | 'seo' | 'social' | 'features' | 'playback' | 'beta' | 'legal';
  label: string;
  description?: string;
  type: 'string' | 'text' | 'boolean' | 'number' | 'url' | 'email';
  isPublic: boolean;
  default: T;
  /** Numbers only. Enforced on save as well as in the input. */
  min?: number;
  max?: number;
}

function define<T>(definition: SettingDefinition<T>): SettingDefinition<T> {
  return definition;
}

export const SETTING_DEFINITIONS = {
  siteName: define({
    key: 'siteName',
    group: 'general',
    label: 'Oldal neve',
    type: 'string',
    isPublic: true,
    default: 'Yonagi Fansub',
  }),
  siteTagline: define({
    key: 'siteTagline',
    group: 'general',
    label: 'Szlogen',
    description: 'A fejlécben és a megosztási kártyákon jelenik meg.',
    type: 'string',
    isPublic: true,
    default: 'Magyar anime feliratok, éjszakai csendben készítve.',
  }),
  siteDescription: define({
    key: 'siteDescription',
    group: 'seo',
    label: 'Alapértelmezett meta leírás',
    type: 'text',
    isPublic: true,
    default:
      'A Yonagi Fansub magyar feliratokat készít anime sorozatokhoz és filmekhez. Friss részek, projektállapotok és adásnaptár egy helyen.',
  }),
  announcement: define({
    key: 'announcement',
    group: 'general',
    label: 'Kiemelt közlemény',
    description: 'Ha ki van töltve, sáv jelenik meg az oldal tetején. Hagyd üresen az elrejtéshez.',
    type: 'string',
    isPublic: true,
    default: '',
  }),
  announcementHref: define({
    key: 'announcementHref',
    group: 'general',
    label: 'Közlemény hivatkozás',
    type: 'url',
    isPublic: true,
    default: '',
  }),

  discordUrl: define({
    key: 'discordUrl',
    group: 'social',
    label: 'Discord meghívó',
    type: 'url',
    isPublic: true,
    default: '',
  }),
  xUrl: define({
    key: 'xUrl',
    group: 'social',
    label: 'X (Twitter) profil',
    type: 'url',
    isPublic: true,
    default: '',
  }),
  youtubeUrl: define({
    key: 'youtubeUrl',
    group: 'social',
    label: 'YouTube csatorna',
    type: 'url',
    isPublic: true,
    default: '',
  }),
  footerNote: define({
    key: 'footerNote',
    group: 'general',
    label: 'Lábléc-megjegyzés',
    description: 'Egy mondat a lábléc alján, a szerzői jogi sor mellett. Üresen hagyva kimarad.',
    type: 'string',
    isPublic: true,
    default: '',
  }),
  contactEmail: define({
    key: 'contactEmail',
    group: 'general',
    label: 'Nyilvános kapcsolati e-mail',
    type: 'email',
    isPublic: true,
    default: 'info@yonagifansub.hu',
  }),

  registrationOpen: define({
    key: 'registrationOpen',
    group: 'features',
    label: 'Regisztráció engedélyezve',
    description: 'Kikapcsolva senki nem tud új fiókot létrehozni.',
    type: 'boolean',
    isPublic: true,
    default: true,
  }),
  commentsEnabled: define({
    key: 'commentsEnabled',
    group: 'features',
    label: 'Hozzászólások engedélyezve',
    type: 'boolean',
    isPublic: true,
    default: true,
  }),
  commentsRequireApproval: define({
    key: 'commentsRequireApproval',
    group: 'features',
    label: 'Hozzászólások előzetes jóváhagyása',
    description: 'Bekapcsolva minden új hozzászólás moderálásra vár.',
    type: 'boolean',
    isPublic: false,
    default: false,
  }),
  contactFormEnabled: define({
    key: 'contactFormEnabled',
    group: 'features',
    label: 'Kapcsolati űrlap engedélyezve',
    type: 'boolean',
    isPublic: true,
    default: true,
  }),
  maintenanceMode: define({
    key: 'maintenanceMode',
    group: 'features',
    label: 'Karbantartási mód',
    description: 'A látogatók karbantartási oldalt látnak. Az admin felület elérhető marad.',
    type: 'boolean',
    isPublic: true,
    default: false,
  }),

  ogImageUrl: define({
    key: 'ogImageUrl',
    group: 'seo',
    label: 'Alapértelmezett megosztási kép',
    description: 'Ajánlott méret: 1200×630. Üresen hagyva generált kép készül.',
    type: 'url',
    isPublic: true,
    default: '',
  }),
  indexingEnabled: define({
    key: 'indexingEnabled',
    group: 'seo',
    label: 'Keresőmotorok általi indexelés',
    description: 'Kikapcsolva a robots.txt minden botot kizár.',
    type: 'boolean',
    isPublic: true,
    default: true,
  }),

  // ── Béta állapot ───────────────────────────────────────────────────────────

  betaMode: define({
    key: 'betaMode',
    group: 'beta',
    label: 'Béta mód',
    description:
      'Sáv jelenik meg minden oldalon, ami közli a látogatóval, hogy az oldal még fejlesztés alatt áll. Semmit nem tilt le — csak őszintén megmondja.',
    type: 'boolean',
    isPublic: true,
    default: false,
  }),
  betaMessage: define({
    key: 'betaMessage',
    group: 'beta',
    label: 'Béta üzenet',
    description: 'Amit a sáv ír. Üresen hagyva egy alapértelmezett mondat jelenik meg.',
    type: 'string',
    isPublic: true,
    default: '',
  }),
  betaFeedbackUrl: define({
    key: 'betaFeedbackUrl',
    group: 'beta',
    label: 'Hibabejelentés hivatkozás',
    description:
      'Ha ki van töltve, a béta sávban megjelenik egy „Hibát találtál?” link. Üresen hagyva a kapcsolati oldalra mutat.',
    type: 'url',
    isPublic: true,
    default: '',
  }),

  // ── Funkciók ───────────────────────────────────────────────────────────────

  scheduleEnabled: define({
    key: 'scheduleEnabled',
    group: 'features',
    label: 'Adásnaptár',
    description: 'Kikapcsolva a /naptar oldal eltűnik a menüből és 404-et ad.',
    type: 'boolean',
    isPublic: true,
    default: true,
  }),
  changelogEnabled: define({
    key: 'changelogEnabled',
    group: 'features',
    label: 'Fejlesztési napló',
    description: 'A nyilvános /fejlesztes oldal, ahol az oldal változásai olvashatók.',
    type: 'boolean',
    isPublic: true,
    default: true,
  }),
  recruitingOpen: define({
    key: 'recruitingOpen',
    group: 'features',
    label: 'Toborzás nyitva',
    description: 'Kikapcsolva a /csatlakozz oldal jelzi, hogy jelenleg nem keresünk új tagot.',
    type: 'boolean',
    isPublic: true,
    default: true,
  }),
  profilesPublic: define({
    key: 'profilesPublic',
    group: 'features',
    label: 'Nyilvános felhasználói profilok',
    description:
      'Kikapcsolva a /felhasznalo/… oldalak 404-et adnak, és a hozzászólásokban a név nem lesz hivatkozás.',
    type: 'boolean',
    isPublic: true,
    default: true,
  }),
  digestEnabled: define({
    key: 'digestEnabled',
    group: 'features',
    label: 'Összefoglaló e-mailek',
    description:
      'A napi és heti értesítő levelek kiküldése. Kikapcsolva a felhasználók beállítása megmarad, csak nem megy ki levél.',
    type: 'boolean',
    isPublic: false,
    default: true,
  }),
  commentEditMinutes: define({
    key: 'commentEditMinutes',
    group: 'features',
    label: 'Hozzászólás szerkesztési ideje (perc)',
    description:
      'Ennyi ideig javíthatja valaki a saját hozzászólását. Nullára állítva a szerkesztés kikapcsol.',
    type: 'number',
    isPublic: true,
    default: 15,
    min: 0,
    max: 1440,
  }),
  projectsPerPage: define({
    key: 'projectsPerPage',
    group: 'features',
    label: 'Projekt / oldal',
    description: 'Hány projekt fér egy lapra a katalógusban.',
    type: 'number',
    isPublic: false,
    default: 24,
    min: 6,
    max: 96,
  }),

  // ── Nézés ──────────────────────────────────────────────────────────────────

  watchEnabled: define({
    key: 'watchEnabled',
    group: 'playback',
    label: 'Online nézés',
    description: 'A beépített lejátszó. Kikapcsolva a részek oldalain nem indul el semmi.',
    type: 'boolean',
    isPublic: true,
    default: true,
  }),
  watchProgressEnabled: define({
    key: 'watchProgressEnabled',
    group: 'playback',
    label: 'Nézési előrehaladás mentése',
    description:
      'Megjegyzi, hol hagyta abba a néző, és felajánlja a folytatást. Kikapcsolva semmit nem rögzítünk.',
    type: 'boolean',
    isPublic: true,
    default: true,
  }),
  ratingsEnabled: define({
    key: 'ratingsEnabled',
    group: 'playback',
    label: 'Értékelés',
    description: 'A tízes skálájú pontozás a projektoldalon.',
    type: 'boolean',
    isPublic: true,
    default: true,
  }),
  scheduleFutureDays: define({
    key: 'scheduleFutureDays',
    group: 'playback',
    label: 'Naptár — előre hány nap',
    description: 'Ennél távolabbi adásokat nem mutat a naptár.',
    type: 'number',
    isPublic: false,
    default: 21,
    min: 1,
    max: 120,
  }),
  schedulePastDays: define({
    key: 'schedulePastDays',
    group: 'playback',
    label: 'Naptár — vissza hány nap',
    description: 'Ennyi napra visszamenőleg látszanak a már lement részek.',
    type: 'number',
    isPublic: false,
    default: 7,
    min: 0,
    max: 60,
  }),

  privacyUpdatedAt: define({
    key: 'privacyUpdatedAt',
    group: 'legal',
    label: 'Adatkezelési tájékoztató frissítése',
    type: 'string',
    isPublic: true,
    default: '2026-01-01',
  }),
  takedownEmail: define({
    key: 'takedownEmail',
    group: 'legal',
    label: 'Jogi / takedown e-mail',
    type: 'email',
    isPublic: true,
    default: 'legal@yonagifansub.hu',
  }),
} as const;

export type SettingKey = keyof typeof SETTING_DEFINITIONS;

export type Settings = {
  [K in SettingKey]: (typeof SETTING_DEFINITIONS)[K]['default'];
};

export type PublicSettings = Partial<Settings>;

export const SETTING_GROUP_LABELS: Record<SettingDefinition<unknown>['group'], string> = {
  general: 'Általános',
  beta: 'Béta állapot',
  features: 'Funkciók',
  playback: 'Nézés',
  seo: 'SEO',
  social: 'Közösségi felületek',
  legal: 'Jogi',
};

/** Rendering order for the groups. Declaration order in the object is not it. */
export const SETTING_GROUP_ORDER: Array<SettingDefinition<unknown>['group']> = [
  'general',
  'beta',
  'features',
  'playback',
  'seo',
  'social',
  'legal',
];
