import 'server-only';
import { db } from '@/lib/db';
import { CACHE_TAGS, CACHE_TTL, cached } from '@/lib/cache';

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
  group: 'general' | 'seo' | 'social' | 'features' | 'legal';
  label: string;
  description?: string;
  type: 'string' | 'text' | 'boolean' | 'number' | 'url' | 'email';
  isPublic: boolean;
  default: T;
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

function coerce<T>(raw: unknown, definition: SettingDefinition<T>): T {
  if (raw === null || raw === undefined) return definition.default;

  switch (definition.type) {
    case 'boolean':
      return (typeof raw === 'boolean' ? raw : raw === 'true') as T;
    case 'number': {
      const value = Number(raw);
      return (Number.isFinite(value) ? value : definition.default) as T;
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
    result[key] = coerce(stored.get(key), definition);
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

    const value = coerce(raw, definition);

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

export const SETTING_GROUP_LABELS: Record<SettingDefinition<unknown>['group'], string> = {
  general: 'Általános',
  seo: 'SEO',
  social: 'Közösségi felületek',
  features: 'Funkciók',
  legal: 'Jogi',
};
