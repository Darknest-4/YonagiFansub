import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * What the importer tells somebody when a lookup comes back empty.
 *
 * The old message — "Az anime a megadott azonosítóval nem található" — was the
 * same sentence for an id that does not exist, an id belonging to a manga, and
 * an id typed into the wrong box. Only the first of those is the user's mistake
 * in the way the sentence implies, so the other two sent people off to re-check
 * a number that was correct.
 */

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function ok(body: unknown) {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function notFound() {
  return {
    ok: false,
    status: 404,
    headers: new Headers(),
    json: async () => ({}),
    text: async () => 'Not found',
  } as unknown as Response;
}

afterEach(() => {
  fetchMock.mockReset();
});

describe('sikertelen metaadat-lekérés üzenete', () => {
  it('manga azonosítója esetén megmondja, hogy nem anime', async () => {
    const { lookupAnime } = await import('@/server/admin/metadata-sync');

    fetchMock
      // A fő lekérdezés `type: ANIME`-re szűr, tehát üres.
      .mockResolvedValueOnce(ok({ data: { Media: null } }))
      // A szonda szűrés nélkül kérdez — és megtalálja.
      .mockResolvedValueOnce(
        ok({
          data: {
            Media: { id: 180136, type: 'MANGA', title: { romaji: 'Egy manga', english: null } },
          },
        }),
      );

    await expect(lookupAnime({ anilistId: 180136 })).rejects.toThrow(
      /létezik, de MANGA típusú.*Egy manga/s,
    );
  });

  it('nem létező azonosítónál a helyes URL-alakot mutatja', async () => {
    const { lookupAnime } = await import('@/server/admin/metadata-sync');

    fetchMock
      .mockResolvedValueOnce(ok({ data: { Media: null } }))
      .mockResolvedValueOnce(ok({ data: { Media: null } }));

    await expect(lookupAnime({ anilistId: 999_999 })).rejects.toThrow(
      /anilist\.co\/anime\/AZONOSÍTÓ/,
    );
  });

  it('MAL-azonosítónál a MyAnimeList címét mutatja', async () => {
    const { lookupAnime } = await import('@/server/admin/metadata-sync');

    fetchMock
      // AniList idMal alapján: nincs találat.
      .mockResolvedValueOnce(ok({ data: { Media: null } }))
      // Jikan: nincs ilyen.
      .mockResolvedValueOnce(notFound());

    await expect(lookupAnime({ malId: 999_999, includeEpisodes: false })).rejects.toThrow(
      /myanimelist\.net\/anime\/AZONOSÍTÓ/,
    );
  });

  /**
   * The distinction the whole branch exists for: an upstream that is *down*
   * must not be reported as a bad id, or somebody spends an evening checking a
   * number while the real answer is "try again in ten minutes".
   */
  it('elérhetetlen forrásnál nem az azonosítót hibáztatja', async () => {
    const { lookupAnime } = await import('@/server/admin/metadata-sync');

    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      headers: new Headers(),
      json: async () => ({}),
      text: async () => 'Cloudflare',
    } as unknown as Response);

    await expect(lookupAnime({ anilistId: 20, includeEpisodes: false })).rejects.toThrow(
      /nem elérhetők/,
    );
  });
});
