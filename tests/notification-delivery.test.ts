import { describe, expect, it } from 'vitest';
import { digestPeriod, digestWindowStart, isDigestDue } from '@/server/digest';
import { classifyStatus } from '@/server/link-check';

/**
 * The two rules behind the delivery jobs.
 *
 * Both jobs are mostly database work, but each turns on one decision that has to
 * be right, and neither decision needs a database to check:
 *
 *   • who gets a digest, and covering what window — get this wrong and people
 *     are either spammed or silently skipped, and both are discovered late;
 *   • what an HTTP status means about a download mirror — get this wrong and
 *     working mirrors disappear from the site on their own.
 */

const HOUR = 3_600_000;
const DAY = 86_400_000;

describe('digest preference', () => {
  it('csak a napi és a heti értéket fogadja el', () => {
    expect(digestPeriod({ emailDigest: 'daily' })).toBe('daily');
    expect(digestPeriod({ emailDigest: 'weekly' })).toBe('weekly');
  });

  it('a kikapcsolt, hiányzó és értelmezhetetlen beállítás mind „ne küldj”', () => {
    expect(digestPeriod({ emailDigest: 'off' })).toBeNull();
    expect(digestPeriod({})).toBeNull();
    expect(digestPeriod(null)).toBeNull();
    expect(digestPeriod(undefined)).toBeNull();
    expect(digestPeriod('daily')).toBeNull();
    expect(digestPeriod({ emailDigest: true })).toBeNull();
    expect(digestPeriod({ emailDigest: 'DAILY' })).toBeNull();
  });
});

describe('esedékesség', () => {
  const now = new Date('2026-09-01T02:00:00Z');

  it('akinek még sosem ment ki, annak esedékes', () => {
    expect(isDigestDue('daily', null, now)).toBe(true);
    expect(isDigestDue('weekly', null, now)).toBe(true);
  });

  it('a napi nem küld ki naponta kétszer', () => {
    expect(isDigestDue('daily', new Date(now.getTime() - 3 * HOUR), now)).toBe(false);
  });

  /*
    Ez a teszt a lényeg. Az éjszakai futás sosem indul pontosan ugyanabban a
    másodpercben; ha a küszöb pontos 24 óra lenne, egy percnyi korábbi indulás a
    következő éjszakára tolná a levelet — és onnantól minden második nap
    maradna ki.
  */
  it('egy perccel korábban induló futás nem tolja el a napi levelet', () => {
    const almostADayAgo = new Date(now.getTime() - (24 * HOUR - 60_000));
    expect(isDigestDue('daily', almostADayAgo, now)).toBe(true);
  });

  it('a heti nem megy ki négy nap után, de hét nap múlva igen', () => {
    expect(isDigestDue('weekly', new Date(now.getTime() - 4 * DAY), now)).toBe(false);
    expect(isDigestDue('weekly', new Date(now.getTime() - 7 * DAY), now)).toBe(true);
  });
});

describe('összefoglaló időablaka', () => {
  const now = new Date('2026-09-01T02:00:00Z');

  it('az előző küldéstől számol, ha az frissebb, mint az ablak', () => {
    const lastSent = new Date(now.getTime() - 25 * HOUR);
    expect(digestWindowStart('weekly', lastSent, now)).toEqual(lastSent);
  });

  /*
    Aki egy év tagság után kapcsolja be a beállítást, ne az egész
    értesítés-történetét kapja meg egyetlen levélben.
  */
  it('az első levél is korlátozott ablakot kap', () => {
    const start = digestWindowStart('daily', null, now);
    expect(start.getTime()).toBe(now.getTime() - 26 * HOUR);
  });

  it('a rég küldött előzményt is levágja az ablak', () => {
    const ancient = new Date(now.getTime() - 400 * DAY);
    const start = digestWindowStart('weekly', ancient, now);
    expect(start.getTime()).toBe(now.getTime() - 8 * DAY);
  });
});

describe('letöltési link állapota HTTP-válasz alapján', () => {
  it('a sikeres és az átirányító válasz is elérhetőnek számít', () => {
    // Egy filehost, ami a letöltőoldalára irányít, pontosan úgy működik, ahogy kell.
    for (const status of [200, 204, 206, 301, 302, 307, 308]) {
      expect(classifyStatus(status)).toBe('ONLINE');
    }
  });

  it('csak a „nincs meg” minősít halottnak', () => {
    expect(classifyStatus(404)).toBe('OFFLINE');
    expect(classifyStatus(410)).toBe('OFFLINE');
  });

  /*
    Ez az aszimmetria a lényeg: egy élő tükör tévesen halottnak jelölése valódi
    letöltésbe kerül, egy halott tükör meghagyása egyetlen félrekattintásba.
    A botvédelem és a szerverhiba tehát NEM halál.
  */
  it('a kapuőrködés és a szerverhiba nem halál, csak akadozás', () => {
    for (const status of [401, 403, 429, 500, 502, 503, 504]) {
      expect(classifyStatus(status)).toBe('DEGRADED');
    }
  });
});
