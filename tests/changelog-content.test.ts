import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { CHANGELOG, CHANGE_KIND_LABELS, changelogStats } from '@/content/changelog';

/**
 * The development log is content, so most of it cannot be tested. Three things
 * about it can, and each has already been a bug in some project's changelog:
 *
 * 1. The page uses the change title as a React key inside a day. Two identical
 *    titles in one entry and React renders one of them, silently.
 * 2. A commit id that does not exist turns the log's one piece of evidence into
 *    a decoration. This is checked against the actual repository.
 * 3. Dates out of order put "yesterday" above "today" on a page whose whole
 *    claim is that it is in order.
 */

describe('a fejlesztési napló tartalma', () => {
  it('nem üres, és minden bejegyzésben van változás', () => {
    expect(CHANGELOG.length).toBeGreaterThan(0);
    for (const entry of CHANGELOG) {
      expect(entry.changes.length, entry.title).toBeGreaterThan(0);
    }
  });

  it('a dátumok érvényesek és fordított időrendben állnak', () => {
    const dates = CHANGELOG.map((entry) => entry.date);

    for (const date of dates) {
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(new Date(`${date}T12:00:00Z`).getTime())).toBe(false);
    }

    const sorted = [...dates].sort().reverse();
    expect(dates).toEqual(sorted);
  });

  it('egy napon belül nincs két azonos című változás', () => {
    // A napló oldalán a cím a React-kulcs: két azonosból az egyik némán eltűnne.
    for (const entry of CHANGELOG) {
      const titles = entry.changes.map((change) => change.title);
      expect(new Set(titles).size, entry.title).toBe(titles.length);
    }
  });

  it('minden típus ismert', () => {
    for (const entry of CHANGELOG) {
      for (const change of entry.changes) {
        expect(CHANGE_KIND_LABELS[change.kind], change.title).toBeTruthy();
      }
    }
  });

  it('a commit-azonosító alakja rövid hash', () => {
    for (const entry of CHANGELOG) {
      for (const change of entry.changes) {
        if (change.commit === undefined) continue;
        expect(change.commit, change.title).toMatch(/^[0-9a-f]{7,40}$/);
      }
    }
  });

  /**
   * The claim the page makes out loud — "a commit azonosítója ott van mellette"
   * — checked against the repository it is written in. A log whose evidence
   * does not resolve is worse than one with no evidence, because it invites
   * trust it has not earned.
   */
  it('minden hivatkozott commit létezik ebben a repóban', () => {
    const hashes = CHANGELOG.flatMap((entry) =>
      entry.changes.map((change) => change.commit).filter((hash): hash is string => Boolean(hash)),
    );

    expect(hashes.length).toBeGreaterThan(0);

    for (const hash of hashes) {
      // `--verify` a hash-re önmagában akkor is sikerülne, ha az egy fájl neve
      // lenne; a `^{commit}` az, ami tényleg commitot követel.
      const resolved = execFileSync('git', ['rev-parse', '--verify', `${hash}^{commit}`], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();

      expect(resolved.startsWith(hash), `${hash} nem oldható fel`).toBe(true);
    }
  });

  it('csak a legfrissebb bejegyzésben hiányozhat commit', () => {
    const missing = CHANGELOG.flatMap((entry, index) =>
      entry.changes.filter((change) => !change.commit).map(() => index),
    );

    // Kizárólag a legelső (legfrissebb) bejegyzésben állhat commit nélküli tétel:
    // annak a commitja még nem létezett, amikor a szöveg megíródott.
    for (const index of missing) expect(index).toBe(0);
  });

  it('a statisztika a valódi tartalmat számolja', () => {
    const stats = changelogStats();

    expect(stats.entries).toBe(CHANGELOG.length);
    expect(stats.changes).toBe(
      CHANGELOG.reduce((total, entry) => total + entry.changes.length, 0),
    );
    // Fordított időrend: az első bejegyzés a legutolsó nap.
    expect(stats.last).toBe(CHANGELOG[0]?.date);
    expect(stats.first).toBe(CHANGELOG[CHANGELOG.length - 1]?.date);
  });
});
