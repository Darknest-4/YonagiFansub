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
