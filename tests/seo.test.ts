import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Share images and structured data.
 *
 * Both fail silently, which is why they are pinned here. A missing share image
 * shows up as a bare URL in somebody else's Discord, and a breadcrumb trail that
 * disagrees with the page shows up as nothing at all — search engines quietly
 * discount the page's structured data instead of reporting a problem.
 */

process.env.NEXT_PUBLIC_SITE_URL = 'https://yonagi.example';
process.env.AUTH_SECRET = 'teszt-titok-elegge-hosszu-ahhoz-hogy-atmenjen-1234';

let seo: typeof import('@/lib/seo');

beforeAll(async () => {
  seo = await import('@/lib/seo');
});

describe('megosztási kép', () => {
  it('a saját képet használja, ha van', () => {
    expect(seo.ogImages('https://cdn.example.org/borito.jpg', 'Yoru no Shizuku')).toEqual({
      images: [
        {
          url: 'https://cdn.example.org/borito.jpg',
          width: 1200,
          height: 630,
          alt: 'Yoru no Shizuku',
        },
      ],
    });
  });

  /*
    Ez a teszt a lényeg. Az oldalak korábban `undefined`-ot adtak kép hiányában,
    abból pedig „nincs megosztási kép" lett — a projekt-, epizód-, hír- és
    csapattag-oldalak mind csupasz linkként jelentek meg a Discordon.
  */
  it('kép hiányában sem marad üresen — az oldal saját képére esik vissza', () => {
    for (const empty of [null, undefined, '']) {
      const result = seo.ogImages(empty);
      expect(result.images).toHaveLength(1);
      expect(result.images[0]!.url).toBe('https://yonagi.example/opengraph-image');
    }
  });

  it('a Twitter-változat ugyanígy viselkedik', () => {
    expect(seo.twitterImages('https://cdn.example.org/x.jpg')).toEqual({
      images: ['https://cdn.example.org/x.jpg'],
    });
    expect(seo.twitterImages(null)).toEqual({
      images: ['https://yonagi.example/opengraph-image'],
    });
  });
});

describe('morzsamenü strukturált adat', () => {
  it('sorszámozva, abszolút címekkel írja le az utat', () => {
    const parsed = JSON.parse(
      seo.breadcrumbJsonLd([
        { name: 'Kezdőlap', path: '/' },
        { name: 'Projektek', path: '/projektek' },
        { name: 'Yoru no Shizuku' },
      ]),
    ) as { '@type': string; itemListElement: Array<Record<string, unknown>> };

    expect(parsed['@type']).toBe('BreadcrumbList');
    expect(parsed.itemListElement.map((e) => e.position)).toEqual([1, 2, 3]);
    expect(parsed.itemListElement[1]!.item).toBe('https://yonagi.example/projektek');
  });

  /*
    Az utolsó elem maga az aktuális oldal. A schema.org szerint ilyenkor a
    hivatkozás elhagyható — és ez jobb is, mint kitalálni neki egy címet, ami
    máshová mutat: az eltérés miatt a kereső az oldal többi jelölésében sem bízik.
  */
  it('az utolsó elem cím nélkül marad', () => {
    const parsed = JSON.parse(
      seo.breadcrumbJsonLd([{ name: 'Kezdőlap', path: '/' }, { name: 'Aktuális oldal' }]),
    ) as { itemListElement: Array<Record<string, unknown>> };

    expect(parsed.itemListElement[1]).not.toHaveProperty('item');
    expect(parsed.itemListElement[1]!.name).toBe('Aktuális oldal');
  });
});

describe('oldal-szintű azonosság', () => {
  it('a keresődobozt a valódi keresési útvonalra mutatja', () => {
    const parsed = JSON.parse(seo.siteJsonLd('Yonagi Fansub', 'Magyar anime feliratok.')) as {
      '@graph': Array<Record<string, never>>;
    };

    const types = parsed['@graph'].map((node) => node['@type']);
    expect(types).toEqual(['Organization', 'WebSite']);

    const site = parsed['@graph'][1] as unknown as {
      potentialAction: { target: { urlTemplate: string } };
      publisher: { '@id': string };
    };
    expect(site.potentialAction.target.urlTemplate).toBe(
      'https://yonagi.example/kereses?q={search_term_string}',
    );
    // A kiadó hivatkozása az Organization csomópontra mutat, nem egy másolatra.
    expect(site.publisher['@id']).toBe('https://yonagi.example/#organization');
  });
});
