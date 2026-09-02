import 'server-only';
import { db } from '@/infrastructure/db';
import { CACHE_TAGS, CACHE_TTL, cached } from '@/infrastructure/cache';
import { ForbiddenError } from '@/shared/lib/errors';

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

import {
  SETTING_DEFINITIONS,
  type PublicSettings,
  type SettingDefinition,
  type SettingKey,
  type Settings,
} from '@/features/settings/definitions';

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

