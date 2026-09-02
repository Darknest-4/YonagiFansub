import 'server-only';
import { db } from '@/lib/db';
import { CACHE_TAGS, CACHE_TTL, cached } from '@/lib/cache';
import { ForbiddenError } from '@/lib/errors';

/**
 * Site settings.
 *
 * Declared here with defaults and types, stored in the database, editable from
 * the admin panel. The declaration is the contract: `getSettings()` always
 * returns a fully-populated, typed object, so no consumer ever has to handle a
 * missing key or a wrong type — a fresh database renders a correct site.
 *
 * `isPublic` decides whether a value may be serialised to the browser. Anything
 * operational (webhooks, moderation thresholds) stays server-side.
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
      'A Yonagi Fansub magyar feliratokat készít anime sorozatokhoz és filmekhez. Friss kiadások, projektállapotok és letöltések egy helyen.',
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

  // ── Nézés és letöltés ──────────────────────────────────────────────────────

  downloadsEnabled: define({
    key: 'downloadsEnabled',
    group: 'playback',
    label: 'Letöltési linkek',
    description: 'Kikapcsolva a kiadásoknál nem jelennek meg a letöltési hivatkozások.',
    type: 'boolean',
    isPublic: true,
    default: true,
  }),
  watchEnabled: define({
    key: 'watchEnabled',
    group: 'playback',
    label: 'Online nézés',
    description: 'A beépített lejátszó. Kikapcsolva csak letölteni lehet.',
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

/**
 * Turns whatever is stored (or submitted) into the declared type.
 *
 * Numbers are clamped to `min`/`max` here rather than only in the admin form,
 * and the difference matters: the form is one of three ways a value gets in —
 * the API accepts a raw body, and a row can be edited straight in the database.
 * Clamping at the boundary every read and write passes through is what makes
 * "a number of items per page" impossible to set to `-1`, whichever door it
 * came through. An out-of-range row already in the table is corrected on read,
 * so a bad value cannot sit there breaking a query until somebody notices.
 */
export function coerceSettingValue<T>(raw: unknown, definition: SettingDefinition<T>): T {
  if (raw === null || raw === undefined) return definition.default;

  switch (definition.type) {
    case 'boolean':
      return (typeof raw === 'boolean' ? raw : raw === 'true') as T;
    case 'number': {
      // An empty input posts `''`, and `Number('')` is 0 — which for
      // `projectsPerPage` would be a catalogue with nothing on it rather than
      // the "leave it alone" the person meant.
      if (raw === '') return definition.default;

      const value = Number(raw);
      if (!Number.isFinite(value)) return definition.default;

      const floor = definition.min ?? Number.NEGATIVE_INFINITY;
      const ceiling = definition.max ?? Number.POSITIVE_INFINITY;
      return Math.min(Math.max(Math.round(value), floor), ceiling) as T;
    }
    default:
      return (typeof raw === 'string' ? raw : String(raw)) as T;
  }
}

async function loadSettings(): Promise<Settings> {
  const rows = await db.siteSetting.findMany({ select: { key: true, value: true } });
  const stored = new Map(rows.map((row) => [row.key, row.value]));

  const result = {} as Settings;
  for (const [key, definition] of Object.entries(SETTING_DEFINITIONS)) {
    // @ts-expect-error – the mapped type is correct by construction of the map.
    result[key] = coerceSettingValue(stored.get(key), definition);
  }
  return result;
}

/**
 * Cached settings read. Called on every server render, so it must be cheap —
 * one query per revalidation window across the whole app.
 */
export const getSettings = cached(loadSettings, ['site-settings'], {
  tags: [CACHE_TAGS.settings],
  revalidate: CACHE_TTL.long,
});

/** Only the keys marked `isPublic`. Safe to embed in the HTML payload. */
export async function getPublicSettings(): Promise<PublicSettings> {
  const settings = await getSettings();
  const result: Record<string, unknown> = {};

  for (const [key, definition] of Object.entries(SETTING_DEFINITIONS)) {
    if (definition.isPublic) result[key] = settings[key as SettingKey];
  }

  return result as PublicSettings;
}

/** Upsert used by the admin panel. Unknown keys are rejected, not silently stored. */
export async function writeSettings(
  values: Record<string, unknown>,
  actorId: string,
): Promise<{ updated: string[]; skipped: string[] }> {
  const updated: string[] = [];
  const skipped: string[] = [];

  for (const [key, raw] of Object.entries(values)) {
    const definition = SETTING_DEFINITIONS[key as SettingKey] as
      | SettingDefinition<unknown>
      | undefined;

    if (!definition) {
      skipped.push(key);
      continue;
    }

    const value = coerceSettingValue(raw, definition);

    await db.siteSetting.upsert({
      where: { key },
      create: {
        key,
        value: value as never,
        group: definition.group,
        label: definition.label,
        description: definition.description ?? null,
        isPublic: definition.isPublic,
        updatedById: actorId,
      },
      update: { value: value as never, updatedById: actorId },
    });

    updated.push(key);
  }

  return { updated, skipped };
}

/**
 * Refuses a request whose feature is switched off.
 *
 * The reason this exists rather than each page simply not drawing the button:
 * hiding a control is a courtesy to the person reading the page, not a rule.
 * The endpoints are reachable with `curl`, and a rating that can still be cast
 * while ratings are "off" makes the setting a lie — the admin turned something
 * off and it kept happening. So every feature that has a write behind it is
 * checked at the boundary as well as in the UI.
 *
 * 403 rather than 404: the resource exists and the caller is who they say they
 * are; what is missing is permission for anybody to do this right now. The
 * message says which, because "Forbidden" against an endpoint that worked
 * yesterday sends somebody looking for a bug in their own code.
 */
export async function assertFeatureEnabled(
  key: SettingKey,
  message: string,
): Promise<void> {
  const settings = await getSettings();
  if (settings[key] !== true) throw new ForbiddenError(message);
}

export const SETTING_GROUP_LABELS: Record<SettingDefinition<unknown>['group'], string> = {
  general: 'Általános',
  beta: 'Béta állapot',
  features: 'Funkciók',
  playback: 'Nézés és letöltés',
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
