import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * What the AniList client puts on the wire.
 *
 * The lookup is a black box from the outside — a wrong variable comes back as
 * "not found", which is indistinguishable from a wrong id. So the request body
 * is asserted directly.
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

function sentVariables(call = 0): Record<string, unknown> {
  const init = fetchMock.mock.calls[call]?.[1] as RequestInit;
  return (JSON.parse(String(init.body)) as { variables: Record<string, unknown> }).variables;
}

afterEach(() => {
  fetchMock.mockReset();
});

describe('fetchAniListMedia változói', () => {
  it('AniList-azonosítónál a malId kulcs egyáltalán nem kerül a kérésbe', async () => {
    const { fetchAniListMedia } = await import('@/features/metadata/anilist');
    fetchMock.mockResolvedValue(ok({ data: { Media: { id: 20 } } }));

    await fetchAniListMedia({ anilistId: 20, malId: null });

    const variables = sentVariables();
    expect(variables).toEqual({ id: 20 });
    // Az explicit null nem ugyanaz, mint a hiányzó kulcs: a szerver
    // értelmezheti szűrőként is.
    expect('malId' in variables).toBe(false);
  });

  it('MAL-azonosítónál fordítva', async () => {
    const { fetchAniListMedia } = await import('@/features/metadata/anilist');
    fetchMock.mockResolvedValue(ok({ data: { Media: { id: 20 } } }));

    await fetchAniListMedia({ anilistId: null, malId: 9253 });

    const variables = sentVariables();
    expect(variables).toEqual({ malId: 9253 });
    expect('id' in variables).toBe(false);
  });

  it('mindkettő megadva az AniList-azonosító nyer, egyedüliként', async () => {
    const { fetchAniListMedia } = await import('@/features/metadata/anilist');
    fetchMock.mockResolvedValue(ok({ data: { Media: { id: 20 } } }));

    await fetchAniListMedia({ anilistId: 20, malId: 9253 });

    expect(sentVariables()).toEqual({ id: 20 });
  });

  it('azonosító nélkül meg sem szólítja az AniListet', async () => {
    const { fetchAniListMedia } = await import('@/features/metadata/anilist');

    await expect(fetchAniListMedia({})).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('probeAniListId', () => {
  it('típusfilter nélkül kérdez, hogy a manga is látszódjon', async () => {
    const { probeAniListId } = await import('@/features/metadata/anilist');
    fetchMock.mockResolvedValue(
      ok({ data: { Media: { id: 180136, type: 'MANGA', title: { romaji: 'Valami', english: null } } } }),
    );

    await expect(probeAniListId(180136)).resolves.toEqual({
      exists: true,
      type: 'MANGA',
      title: 'Valami',
    });

    const body = String((fetchMock.mock.calls[0]?.[1] as RequestInit).body);
    expect(body).not.toContain('type: ANIME');
  });

  it('nem létező azonosítóra exists: false', async () => {
    const { probeAniListId } = await import('@/features/metadata/anilist');
    fetchMock.mockResolvedValue(ok({ data: { Media: null } }));

    await expect(probeAniListId(999_999_999)).resolves.toEqual({ exists: false });
  });

  it('a szonda hibája nem szivárog ki — ez már a hibaút', async () => {
    const { probeAniListId } = await import('@/features/metadata/anilist');
    fetchMock.mockRejectedValue(new Error('hálózat'));

    await expect(probeAniListId(1)).resolves.toEqual({ exists: false });
  });
});
