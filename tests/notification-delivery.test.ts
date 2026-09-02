import { describe, expect, it } from 'vitest';
import { digestPeriod, digestWindowStart, isDigestDue } from '@/server/digest';

/**
 * The rule behind the digest job.
 *
 * The job is mostly database work, but it turns on one decision that has to be
 * right and needs no database to check: who gets a digest, and covering what
 * window. Get it wrong and people are either spammed or silently skipped, and
 * both are discovered late.
 *
 * The mirror-status rules that used to live here went with the download layer.
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
