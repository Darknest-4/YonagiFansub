import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/infrastructure/db';
import { isFullTextAvailable, resetFullTextProbe } from '@/features/search/fts';
import { search } from '@/features/search/service';
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

  /**
   * The bug this pins broke a deploy and, more quietly, autovacuum.
   *
   * Postgres evaluates an index expression during operations that carry no
   * `search_path` of their own — building the index, and every autoanalyze pass
   * afterwards — so an unqualified reference to a function in `public` fails to
   * resolve there while working perfectly from an ordinary session. The first
   * symptom stops a deploy; the second is silent, and statistics simply stop
   * being collected on the busiest tables in the catalogue.
   *
   * Testing the query path alone cannot see any of that: it ran green while both
   * were broken. Nor does a manual `ANALYZE` — that runs with the session's own
   * path, and passes happily on the broken version. Only dropping to the
   * restricted path deliberately reproduces it, which is what this does.
   */
  it('a kereső függvények search_path nélkül is feloldhatók (autovacuum útja)', async () => {
    await make.project({ title: 'Kereses Teszt' });

    // Two statements on one connection: `SET LOCAL` only reaches the next
    // statement if they share a transaction, and Prisma refuses to send both in
    // a single prepared statement.
    await expect(
      db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL search_path = pg_catalog, pg_temp');
        // Cast to text: Prisma has no mapping for `tsvector`, and the point
        // here is that the expression *resolves*, not what it contains.
        return tx.$queryRawUnsafe<Array<{ vector: string }>>(`
          SELECT public.project_search_vector(title, "titleRomaji", "titleEnglish",
                                              "titleNative", synonyms, studio, synopsis)::text
                 AS vector
          FROM public.projects LIMIT 1
        `);
      }),
    ).resolves.toMatchObject([{ vector: expect.stringContaining('kereses') }]);
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
