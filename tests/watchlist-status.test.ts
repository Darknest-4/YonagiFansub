import { describe, expect, it } from 'vitest';
import {
  WATCHLIST_LABELS,
  WATCHLIST_ORDER,
  resolveWatchlistStatus,
  type WatchlistSignals,
} from '@/features/watch/watchlist-rules';

/**
 * A nézési lista szabálykészlete.
 *
 * Ez a funkció lényege, és teljes egészében egy tiszta függvényben lakik —
 * pontosan azért, hogy adatbázis nélkül, gyorsan, minden kombinációra
 * ellenőrizhető legyen. A négy állapot nem zárja ki egymást, tehát nem az
 * számít, hogy külön-külön jók-e, hanem hogy a *sorrend* jó-e ott, ahol
 * egyszerre több is igaz.
 */

function signals(over: Partial<WatchlistSignals> = {}): WatchlistSignals {
  return { mark: null, releasedEpisodes: 12, startedEpisodes: 0, completedEpisodes: 0, ...over };
}

describe('automatikus állapotok', () => {
  it('elkezdett rész → nézem', () => {
    expect(resolveWatchlistStatus(signals({ startedEpisodes: 1 }))).toBe('WATCHING');
  });

  it('minden megjelent rész végignézve → befejezett', () => {
    expect(
      resolveWatchlistStatus(signals({ startedEpisodes: 12, completedEpisodes: 12 })),
    ).toBe('COMPLETED');
  });

  it('egy rész híján nem befejezett, hanem nézem', () => {
    expect(
      resolveWatchlistStatus(signals({ startedEpisodes: 12, completedEpisodes: 11 })),
    ).toBe('WATCHING');
  });

  /*
    Ha időközben új rész jelenik meg, a befejezett sorozat visszalép „nézem"-be.
    Ez helyes: pont ez az, amit a nézőnek tudnia kell.
  */
  it('új rész megjelenése visszaviszi nézembe', () => {
    const done = signals({ releasedEpisodes: 12, startedEpisodes: 12, completedEpisodes: 12 });
    expect(resolveWatchlistStatus(done)).toBe('COMPLETED');
    expect(resolveWatchlistStatus({ ...done, releasedEpisodes: 13 })).toBe('WATCHING');
  });

  /*
    A legfontosabb határeset. „Mindet megnézted" üresen igaz nulla részre, tehát
    a feltétel önmagában minden bejelentett sorozatot a kész listára tenne.
  */
  it('meg nem jelent projekt nem befejezett — a nulla nem „mindet megnézted"', () => {
    expect(
      resolveWatchlistStatus(signals({ releasedEpisodes: 0, completedEpisodes: 0 })),
    ).toBeNull();
  });

  it('jelölés és előrehaladás nélkül nincs a listán', () => {
    expect(resolveWatchlistStatus(signals())).toBeNull();
  });
});

describe('kézi jelölések', () => {
  it('a tervezett kizárólag kézi — magától sosem áll be', () => {
    expect(resolveWatchlistStatus(signals())).toBeNull();
    expect(resolveWatchlistStatus(signals({ mark: 'PLANNED' }))).toBe('PLANNED');
  });

  it('az elhagyott is kézi — tétlenségből nem vezetjük le', () => {
    // Nincs olyan jelzés a bemenetben, amiből „elhagyott" következhetne.
    expect(resolveWatchlistStatus(signals({ startedEpisodes: 3 }))).toBe('WATCHING');
    expect(resolveWatchlistStatus(signals({ startedEpisodes: 3, mark: 'DROPPED' }))).toBe('DROPPED');
  });
});

describe('a sorrend, ahol több állítás is igaz', () => {
  it('az elkezdett nézés felülírja az elavult tervezettet', () => {
    expect(
      resolveWatchlistStatus(signals({ mark: 'PLANNED', startedEpisodes: 1 })),
    ).toBe('WATCHING');
  });

  it('az elhagyott erősebb az előrehaladásnál — kimondott döntés', () => {
    expect(
      resolveWatchlistStatus(signals({ mark: 'DROPPED', startedEpisodes: 6, completedEpisodes: 5 })),
    ).toBe('DROPPED');
  });

  it('a befejezett viszont erősebb az elhagyottnál is', () => {
    // Amit végignéztél, azt nem hagytad el — akkor sem, ha valamikor annak
    // jelölted, és utána mégis befejezted.
    expect(
      resolveWatchlistStatus(
        signals({ mark: 'DROPPED', startedEpisodes: 12, completedEpisodes: 12 }),
      ),
    ).toBe('COMPLETED');
  });

  it('a tervezett a leggyengébb: bármi más felülírja', () => {
    expect(
      resolveWatchlistStatus(
        signals({ mark: 'PLANNED', startedEpisodes: 12, completedEpisodes: 12 }),
      ),
    ).toBe('COMPLETED');
  });
});

describe('a megjelenítés kísérőadatai', () => {
  it('minden állapotnak van magyar címkéje', () => {
    for (const status of WATCHLIST_ORDER) {
      expect(WATCHLIST_LABELS[status], status).toBeTruthy();
    }
  });

  it('a sorrend mind a négy állapotot tartalmazza, ismétlés nélkül', () => {
    expect(new Set(WATCHLIST_ORDER).size).toBe(4);
    expect(WATCHLIST_ORDER).toEqual(expect.arrayContaining(Object.keys(WATCHLIST_LABELS)));
  });

  it('a nézem áll elöl — ez az, amiért valaki megnyitja a listát', () => {
    expect(WATCHLIST_ORDER[0]).toBe('WATCHING');
  });
});
