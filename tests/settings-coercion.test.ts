import { describe, expect, it } from 'vitest';
import {
  SETTING_DEFINITIONS,
  SETTING_GROUP_LABELS,
  SETTING_GROUP_ORDER,
  coerceSettingValue,
  type SettingDefinition,
} from '@/features/settings/service';

/**
 * What a setting turns into on the way in and out.
 *
 * The interesting part is the numbers. A page size arrives as a string from an
 * HTML form, as a number from the API, and as whatever somebody typed if the
 * row is edited in the database directly — and one of those paths reaching the
 * query with `0` or `-1` is a catalogue that renders nothing, or a Prisma
 * `take` that throws. So the clamp is asserted from every direction it can be
 * approached from, not only through the form.
 */

const perPage = SETTING_DEFINITIONS.projectsPerPage;
const editMinutes = SETTING_DEFINITIONS.commentEditMinutes;

describe('coerceSettingValue — számok', () => {
  it('a form szöveges értékéből szám lesz', () => {
    expect(coerceSettingValue('30', perPage)).toBe(30);
  });

  it('a felső határ fölött a maximumra vág', () => {
    expect(coerceSettingValue(5000, perPage)).toBe(perPage.max);
  });

  it('az alsó határ alatt a minimumra vág', () => {
    expect(coerceSettingValue(-1, perPage)).toBe(perPage.min);
    expect(coerceSettingValue(0, perPage)).toBe(perPage.min);
  });

  it('a nulla megengedett ott, ahol a minimum nulla — ez kapcsolja ki a szerkesztést', () => {
    expect(editMinutes.min).toBe(0);
    expect(coerceSettingValue(0, editMinutes)).toBe(0);
  });

  it('az üres mező nem nulla, hanem az alapértelmezés', () => {
    // `Number('')` nulla, ami a projektek oldalán üres katalógust jelentene —
    // pedig aki kitörli a mezőt, az nem ezt kéri.
    expect(coerceSettingValue('', perPage)).toBe(perPage.default);
  });

  it('értelmezhetetlen érték az alapértelmezésre esik vissza', () => {
    expect(coerceSettingValue('huszonnégy', perPage)).toBe(perPage.default);
    expect(coerceSettingValue(Number.NaN, perPage)).toBe(perPage.default);
    expect(coerceSettingValue(Number.POSITIVE_INFINITY, perPage)).toBe(perPage.default);
  });

  it('törtszám egészre kerekedik', () => {
    expect(coerceSettingValue(24.7, perPage)).toBe(25);
  });

  it('hiányzó érték esetén az alapértelmezés jön', () => {
    expect(coerceSettingValue(null, perPage)).toBe(perPage.default);
    expect(coerceSettingValue(undefined, perPage)).toBe(perPage.default);
  });
});

describe('coerceSettingValue — logikai és szöveges', () => {
  it('a form "true" szövegéből igaz lesz', () => {
    expect(coerceSettingValue('true', SETTING_DEFINITIONS.betaMode)).toBe(true);
    expect(coerceSettingValue('false', SETTING_DEFINITIONS.betaMode)).toBe(false);
    // Bármi más se nem igaz, se nem hiba: kikapcsolva a biztonságos alapállás.
    expect(coerceSettingValue('igen', SETTING_DEFINITIONS.betaMode)).toBe(false);
  });

  it('a logikai alapértelmezés akkor is érvényes, ha nincs sor az adatbázisban', () => {
    expect(coerceSettingValue(null, SETTING_DEFINITIONS.scheduleEnabled)).toBe(true);
    expect(coerceSettingValue(null, SETTING_DEFINITIONS.betaMode)).toBe(false);
  });
});

describe('a beállítások deklarációja', () => {
  const definitions = Object.entries(SETTING_DEFINITIONS) as Array<
    [string, SettingDefinition<unknown>]
  >;

  it('a kulcs mindegyiknél megegyezik a mező nevével', () => {
    // Eltérés esetén a mentés más sort írna, mint amit az olvasás keres, és a
    // beállítás némán visszaállna alapértelmezettre minden mentés után.
    for (const [name, definition] of definitions) {
      expect(definition.key).toBe(name);
    }
  });

  it('minden csoportnak van címkéje és helye a sorrendben', () => {
    for (const [, definition] of definitions) {
      expect(SETTING_GROUP_LABELS[definition.group]).toBeTruthy();
      expect(SETTING_GROUP_ORDER).toContain(definition.group);
    }
  });

  it('határ csak számokon van, és a minimum nem nagyobb a maximumnál', () => {
    for (const [name, definition] of definitions) {
      const bounded = definition.min !== undefined || definition.max !== undefined;
      if (bounded) expect(definition.type, name).toBe('number');

      if (definition.min !== undefined && definition.max !== undefined) {
        expect(definition.min, name).toBeLessThanOrEqual(definition.max);
      }
    }
  });

  it('minden szám alapértelmezése a saját határain belül van', () => {
    for (const [name, definition] of definitions) {
      if (definition.type !== 'number') continue;
      const value = definition.default as number;

      if (definition.min !== undefined) expect(value, name).toBeGreaterThanOrEqual(definition.min);
      if (definition.max !== undefined) expect(value, name).toBeLessThanOrEqual(definition.max);
    }
  });
});
