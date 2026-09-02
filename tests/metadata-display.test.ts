import { describe, expect, it } from 'vitest';
import {
  linkTypeRank,
  parseRelations,
  parseSiteLinks,
  relationRank,
} from '@/features/metadata/display';

/**
 * Narrowing what AniList and Jikan wrote into our `Json` columns.
 *
 * These two functions stand between a third-party API and an `href` on our own
 * origin, so the interesting cases are the hostile and the malformed ones: a
 * `javascript:` URL is script execution if it ever reaches an anchor, and a row
 * written by an older importer must degrade to a shorter list rather than a
 * crashed page.
 */

describe('parseSiteLinks', () => {
  it('csak abszolút http(s) URL-t enged át', () => {
    const links = parseSiteLinks([
      { site: 'Hivatalos', url: 'https://example.com/anime', type: 'OFFICIAL' },
      { site: 'Régi', url: 'http://example.org/anime', type: 'INFO' },
      { site: 'XSS', url: 'javascript:alert(document.domain)', type: 'INFO' },
      { site: 'Adat', url: 'data:text/html,<script>alert(1)</script>', type: 'INFO' },
      { site: 'Relatív', url: '/belso/oldal', type: 'INFO' },
      { site: 'Fájl', url: 'file:///etc/passwd', type: 'INFO' },
    ]);

    expect(links.map((link) => link.url)).toEqual([
      'https://example.com/anime',
      'http://example.org/anime',
    ]);
  });

  it('nem hagyja magát a séma írásmódjával megtéveszteni', () => {
    const links = parseSiteLinks([
      { site: 'Nagybetűs', url: 'JavaScript:alert(1)', type: 'INFO' },
      { site: 'Szóközös', url: '  javascript:alert(1)', type: 'INFO' },
      { site: 'Tabos', url: 'java\tscript:alert(1)', type: 'INFO' },
    ]);

    expect(links).toEqual([]);
  });

  it('kiszűri a duplikátumokat, és a hiányzó nevet a hosttal pótolja', () => {
    const links = parseSiteLinks([
      { site: 'Egy', url: 'https://example.com/a', type: 'OFFICIAL' },
      { site: 'Ugyanaz', url: 'https://example.com/a', type: 'OFFICIAL' },
      { site: '   ', url: 'https://cdn.example.org/oldal', type: 'INFO' },
      { url: 'https://masik.example.net/x' },
    ]);

    expect(links).toEqual([
      { site: 'Egy', url: 'https://example.com/a', type: 'OFFICIAL' },
      { site: 'cdn.example.org', url: 'https://cdn.example.org/oldal', type: 'INFO' },
      { site: 'masik.example.net', url: 'https://masik.example.net/x', type: 'INFO' },
    ]);
  });

  it('a hibás alakokat kihagyja, nem dob hibát', () => {
    expect(parseSiteLinks(null)).toEqual([]);
    expect(parseSiteLinks({})).toEqual([]);
    expect(parseSiteLinks('nem tömb')).toEqual([]);
    expect(parseSiteLinks([null, 42, 'x', {}, { url: 7 }])).toEqual([]);
  });

  it('a streaminget sorolja előre', () => {
    expect(linkTypeRank('STREAMING')).toBeLessThan(linkTypeRank('OFFICIAL'));
    expect(linkTypeRank('OFFICIAL')).toBeLessThan(linkTypeRank('SOCIAL'));
    expect(linkTypeRank('ISMERETLEN')).toBeGreaterThan(linkTypeRank('SOCIAL'));
  });
});

describe('parseRelations', () => {
  it('megtartja az azonosítókat, és cím nélkül eldobja a bejegyzést', () => {
    expect(
      parseRelations([
        { relation: 'SEQUEL', anilistId: 2, malId: 20, title: 'Második évad' },
        { relation: 'SIDE_STORY', anilistId: null, malId: null, title: 'Mellékszál' },
        { relation: 'PREQUEL', anilistId: 1 },
        { anilistId: 3, title: 'Reláció nélkül' },
      ]),
    ).toEqual([
      { relation: 'SEQUEL', anilistId: 2, malId: 20, title: 'Második évad' },
      { relation: 'SIDE_STORY', anilistId: null, malId: null, title: 'Mellékszál' },
    ]);
  });

  it('a nem szám azonosítót null-ként kezeli', () => {
    expect(parseRelations([{ relation: 'SEQUEL', anilistId: '2', title: 'Kettő' }])).toEqual([
      { relation: 'SEQUEL', anilistId: null, malId: null, title: 'Kettő' },
    ]);
  });

  it('a hibás alakokat kihagyja, nem dob hibát', () => {
    expect(parseRelations(undefined)).toEqual([]);
    expect(parseRelations([null, 1, 'x', {}])).toEqual([]);
  });

  it('az évadokat sorolja a specialok elé', () => {
    expect(relationRank('PREQUEL')).toBeLessThan(relationRank('SPECIAL'));
    expect(relationRank('SEQUEL')).toBeLessThan(relationRank('OTHER'));
    expect(relationRank('NINCS_ILYEN')).toBeGreaterThanOrEqual(relationRank('OTHER'));
  });
});
