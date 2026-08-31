import { beforeAll, describe, expect, it } from 'vitest';
import { isFullTextAvailable, resetFullTextProbe } from '@/server/search-fts';
import { search } from '@/server/search';
import * as make from './factories';

/**
 * Search, against real Postgres — the only place it can be tested at all.
 *
 * Stemming, accent folding, cover-density ranking and trigram matching are all
 * database behaviour. A unit test can check that the tsquery string is built
 * correctly and nothing beyond it, so everything the two tiers actually *do*
 * lives here.
 */
describe('keresés', () => {
  beforeAll(async () => {
    // `prepareSchema` ran `db:sql`, so tier 2 must be installed. If it is not,
    // every assertion below would still pass on the tier-1 fallback and the
    // suite would report success while testing half the feature.
    resetFullTextProbe();
    expect(await isFullTextAvailable()).toBe(true);
  });

  it('a szó belsejére a trigram réteg is talál', async () => {
    await make.project({ title: 'Shiokaze Café' });

    const response = await search('kaze');

    expect(response.groups[0]?.results[0]?.title).toBe('Shiokaze Café');
  });

  it('az ékezetet a teljes szöveges réteg feloldja', async () => {
    await make.project({ title: 'Shiokaze Café' });

    // "cafe" nem részstringje a "Café"-nak — ezt csak a tier 2 találja meg.
    const response = await search('cafe');

    expect(response.groups[0]?.results[0]?.title).toBe('Shiokaze Café');
  });

  it('a magyar szótövezés a ragozott alakot is megtalálja', async () => {
    await make.newsPost({ title: 'Keresünk időzítőt és formázót' });

    const response = await search('idozito');

    expect(response.groups.flatMap((group) => group.results.map((r) => r.title))).toContain(
      'Keresünk időzítőt és formázót',
    );
  });

  it('a többszavas kereséshez minden szónak illeszkednie kell', async () => {
    await make.newsPost({ title: 'Nyári fesztivál beszámoló' });
    await make.newsPost({ title: 'Téli fesztivál beszámoló' });

    const response = await search('nyari fesztival');
    const titles = response.groups.flatMap((group) => group.results.map((r) => r.title));

    expect(titles).toEqual(['Nyári fesztivál beszámoló']);
  });

  it('a pontosabb egyezés kerül előre', async () => {
    await make.project({ title: 'Hoshi' });
    await make.project({ title: 'Valami Hoshi Valami Nagyon Hosszú Cím' });

    const results = (await search('Hoshi')).groups[0]?.results ?? [];

    expect(results[0]?.title).toBe('Hoshi');
  });

  it('a projekt megelőzi az azonos nevű epizódot', async () => {
    const parent = await make.project({ title: 'Kagerou' });
    await make.episode(parent.id, { number: 7, title: 'Kagerou' });

    const response = await search('Kagerou');

    expect(response.groups[0]?.type).toBe('project');
  });

  it('a szinonima alapján is megtalálható', async () => {
    await make.project({ title: 'Yoru no Shizuku', synonyms: ['YnS'] });

    const response = await search('YnS');

    expect(response.groups[0]?.results[0]?.title).toBe('Yoru no Shizuku');
  });

  it('a tsquery operátorai nem törik el a lekérdezést', async () => {
    await make.project({ title: 'Re:Zero' });

    // Ha az operátorok átjutnának, ez szintaktikai hibával szállna el.
    await expect(search('Re:Zero')).resolves.toMatchObject({
      groups: [{ results: [{ title: 'Re:Zero' }] }],
    });
    await expect(search('!!! ??? ((')).resolves.toMatchObject({ total: 0 });
    await expect(search("' OR 1=1 --")).resolves.toMatchObject({ total: 0 });
  });

  it('a kétkarakternél rövidebb kérdés nem kérdezi le az adatbázist', async () => {
    await make.project({ title: 'A' });

    expect(await search('a')).toEqual({ query: 'a', groups: [], total: 0 });
  });
});
