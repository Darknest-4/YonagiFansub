import { describe, expect, it } from 'vitest';
import { EDIT_WINDOW_MS, withinEditWindow } from '@/server/comments';

/**
 * The edit window, pinned as a pure function.
 *
 * The rule it encodes is not "15 minutes is a nice number": past it, somebody
 * may have replied, and silently rewriting the text they answered turns their
 * reply into a non-sequitur.
 */
describe('withinEditWindow', () => {
  const now = new Date('2026-09-01T12:00:00Z');

  it('a friss hozzászólás szerkeszthető', () => {
    expect(withinEditWindow(new Date(now.getTime() - 60_000), now)).toBe(true);
  });

  it('a határon még szerkeszthető', () => {
    expect(withinEditWindow(new Date(now.getTime() - EDIT_WINDOW_MS), now)).toBe(true);
  });

  it('egy másodperccel az ablak után már nem', () => {
    expect(withinEditWindow(new Date(now.getTime() - EDIT_WINDOW_MS - 1000), now)).toBe(false);
  });
});

/**
 * The window is now the `commentEditMinutes` setting rather than a constant,
 * and zero has a meaning of its own: editing is off. That case needs its own
 * assertion because the naive form of the check gets it wrong — a comment
 * written this millisecond satisfies `now - createdAt <= 0`.
 */
describe('withinEditWindow — állítható ablak', () => {
  const now = new Date('2026-09-02T12:00:00Z');
  const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

  it('a megadott perc a határ, nem a beégetett tizenöt', () => {
    expect(withinEditWindow(minutesAgo(20), now, 30)).toBe(true);
    expect(withinEditWindow(minutesAgo(20), now, 10)).toBe(false);
  });

  it('nulla perc: a szerkesztés ki van kapcsolva, frissen írt hozzászólásnál is', () => {
    expect(withinEditWindow(now, now, 0)).toBe(false);
    expect(withinEditWindow(minutesAgo(0), now, 0)).toBe(false);
  });

  it('negatív érték sem nyit ablakot', () => {
    expect(withinEditWindow(now, now, -5)).toBe(false);
  });

  it('perc nélkül az alapértelmezés érvényes', () => {
    expect(withinEditWindow(minutesAgo(14), now)).toBe(true);
    expect(withinEditWindow(minutesAgo(16), now)).toBe(false);
  });
});
