import { describe, expect, it } from 'vitest';
import { db } from '@/infrastructure/db';
import { getProjectWatchState, getWatchlist, setWatchlistMark } from '@/features/watch/watchlist-service';
import { recordProgress } from '@/features/watch/service';
import * as make from './factories';

/**
 * A nézési lista valódi adatbázis ellen.
 *
 * A szabálykészletet egy egységteszt már lefedi, és ez nem ugyanaz: ott a
 * jelek kézzel érkeznek, itt viszont az a kérdés, hogy a lekérdezések tényleg
 * azokat a jeleket adják-e. Két hiba lakhat csak itt — hogy a számlálás
 * beleveszi a nem megjelent vagy a nem publikált projekt részeit, és hogy a
 * lista tagjai nem a jelölések és az előrehaladás uniójából állnak.
 */

/** Egy néző, egy projekt, `count` megjelent résszel. */
async function scenario(count: number) {
  const viewer = await make.user();
  const parent = await make.project();
  const episodes = [];
  for (let n = 1; n <= count; n += 1) {
    episodes.push(await make.episode(parent.id, { number: n, durationSec: 1400 }));
  }
  return { viewer, parent, episodes };
}

describe('a lista összeállítása', () => {
  it('előrehaladás nélkül, jelölés nélkül üres', async () => {
    const { viewer } = await scenario(3);
    await expect(getWatchlist(viewer.id)).resolves.toEqual([]);
  });

  it('a kézi jelölés önmagában is felviszi a listára', async () => {
    const { viewer, parent } = await scenario(3);
    await setWatchlistMark(viewer.id, parent.id, 'PLANNED');

    const list = await getWatchlist(viewer.id);
    expect(list).toHaveLength(1);
    expect(list[0]?.status).toBe('PLANNED');
    expect(list[0]?.project.id).toBe(parent.id);
  });

  it('az előrehaladás önmagában is felviszi — jelölés nélkül', async () => {
    const { viewer, parent, episodes } = await scenario(3);
    await recordProgress({ userId: viewer.id, episodeId: episodes[0]!.id, positionSec: 300 });

    const list = await getWatchlist(viewer.id);
    expect(list).toHaveLength(1);
    expect(list[0]?.status).toBe('WATCHING');
  });

  it('minden rész végignézve → befejezett, 100 százalékkal', async () => {
    const { viewer, parent, episodes } = await scenario(3);
    for (const part of episodes) {
      await recordProgress({
        userId: viewer.id,
        episodeId: part.id,
        positionSec: 1400,
        completed: true,
      });
    }

    const list = await getWatchlist(viewer.id);
    expect(list[0]?.status).toBe('COMPLETED');
    expect(list[0]?.percent).toBe(100);
    expect(list[0]?.completedEpisodes).toBe(3);
    expect(list[0]?.releasedEpisodes).toBe(3);
  });
});

describe('mit vesz számításba', () => {
  /**
   * A legfontosabb: a nevező csak a megjelent részekből áll.
   *
   * Ha a még készülő részek is beleszámítanának, egy futó sorozatot soha nem
   * lehetne befejezettnek látni — pedig aki minden kint lévő részt megnézett,
   * pontosan azt szeretné olvasni, hogy utolérte.
   */
  it('a nem megjelent rész nem számít bele a nevezőbe', async () => {
    const { viewer, parent, episodes } = await scenario(2);
    await make.episode(parent.id, { number: 3, status: 'IN_PROGRESS' });

    for (const part of episodes) {
      await recordProgress({
        userId: viewer.id,
        episodeId: part.id,
        positionSec: 1400,
        completed: true,
      });
    }

    const state = await getProjectWatchState(viewer.id, parent.id);
    expect(state.status).toBe('COMPLETED');

    const list = await getWatchlist(viewer.id);
    expect(list[0]?.releasedEpisodes).toBe(2);
  });

  it('a nem publikált projekt nem kerül a listára', async () => {
    const viewer = await make.user();
    const hidden = await make.project({ publishStatus: 'DRAFT' });
    await setWatchlistMark(viewer.id, hidden.id, 'PLANNED').catch(() => undefined);

    await expect(getWatchlist(viewer.id)).resolves.toEqual([]);
  });

  it('a törölt rész előrehaladása sem számít', async () => {
    const { viewer, parent, episodes } = await scenario(2);
    await recordProgress({ userId: viewer.id, episodeId: episodes[0]!.id, positionSec: 400 });
    await db.episode.update({ where: { id: episodes[0]!.id }, data: { deletedAt: new Date() } });

    const state = await getProjectWatchState(viewer.id, parent.id);
    expect(state.status).toBeNull();
  });
});

describe('a kézi jelölés kezelése', () => {
  it('a jelölés visszavonása nem veszi le a listáról, ha van előrehaladás', async () => {
    const { viewer, parent, episodes } = await scenario(3);
    await setWatchlistMark(viewer.id, parent.id, 'DROPPED');
    await recordProgress({ userId: viewer.id, episodeId: episodes[0]!.id, positionSec: 200 });

    expect((await getProjectWatchState(viewer.id, parent.id)).status).toBe('DROPPED');

    const after = await setWatchlistMark(viewer.id, parent.id, null);
    // A jelölés eltűnt, de a nézés megmaradt — onnantól az az igaz.
    expect(after.mark).toBeNull();
    expect(after.status).toBe('WATCHING');
  });

  it('a nem létező jelölés törlése nem hiba', async () => {
    const { viewer, parent } = await scenario(1);
    await expect(setWatchlistMark(viewer.id, parent.id, null)).resolves.toMatchObject({
      mark: null,
    });
  });

  it('a válasz a kiszámolt állapotot adja vissza, nem a kért jelölést', async () => {
    const { viewer, parent, episodes } = await scenario(3);
    await recordProgress({ userId: viewer.id, episodeId: episodes[0]!.id, positionSec: 500 });

    // „Tervezett"-nek jelöli, pedig már nézi. A válasz ezt kimondja.
    const result = await setWatchlistMark(viewer.id, parent.id, 'PLANNED');
    expect(result.mark).toBe('PLANNED');
    expect(result.status).toBe('WATCHING');
  });

  it('ismeretlen projektre nem lehet jelölést tenni', async () => {
    const viewer = await make.user();
    await expect(setWatchlistMark(viewer.id, 'cmnemletezoprojekt0000000', 'PLANNED')).rejects.toThrow();
  });
});

describe('rendezés', () => {
  it('a legutóbb mozgatott áll elöl', async () => {
    const viewer = await make.user();

    const older = await make.project();
    await make.episode(older.id, { number: 1 });
    await setWatchlistMark(viewer.id, older.id, 'PLANNED');

    const newer = await make.project();
    await make.episode(newer.id, { number: 1 });
    await setWatchlistMark(viewer.id, newer.id, 'PLANNED');

    const list = await getWatchlist(viewer.id);
    expect(list.map((item) => item.project.id)).toEqual([newer.id, older.id]);
  });
});
