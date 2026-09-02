/**
 * A nézési lista szabálykészlete — adatbázis nélkül.
 *
 * Külön modul, mert a projektoldal kapcsolója kliens komponens, és a
 * `server/watchlist.ts` `server-only`: onnan importálva a böngészőbe kerülő
 * kód fordításkor eldobna. Itt csak típus, címke és egy tiszta függvény van,
 * amiből semmi nem szivárog ki.
 *
 * ## Amit tárolunk, és amit nem
 *
 * Két állapot **kiszámolható** abból, amit a lejátszó amúgy is rögzít:
 *
 *   • **nézem** — van előrehaladás a projekt valamelyik részén;
 *   • **befejezett** — a megjelent részek mindegyike végignézve.
 *
 * Kettő **nem következik semmiből**, tehát kézzel kell megmondani:
 *
 *   • **tervezett** — „majd megnézem". Erről az adatbázisban semmilyen nyom
 *     nincs, amiből ki lehetne olvasni;
 *   • **elhagyott** — „nem folytatom". Ezt szándékosan nem vezetjük le
 *     tétlenségből: aki két hónapja nem nézett egy sorozatot, nem feltétlenül
 *     hagyta el — lehet, hogy vár a következő évadra, vagy egyszerűen dolga
 *     volt. Kimondani, hogy valaki feladott valamit, nem a mi dolgunk.
 *
 * Ha a „nézem" is tárolt lenne, azonnal elavulna: valaki megnézne egy részt, a
 * lista pedig tovább írná, hogy tervezi.
 *
 * ## A sorrend, amiben eldől
 *
 * A négy állapot nem zárja ki egymást — valakinek lehet „tervezett" jelölése
 * egy sorozaton, amit közben elkezdett nézni. A sorrend az, hogy melyik állítás
 * mond többet a mostani helyzetről:
 *
 *   1. **befejezett**, ha minden megjelent rész megvan. A legerősebb tény, és
 *      egy régi „elhagyott" jelölést is felülír: amit végignéztél, azt nem
 *      hagytad el.
 *   2. **elhagyott**, ha így jelölted. Kimondott döntés, erősebb annál, mint
 *      hogy régebben elkezdted.
 *   3. **nézem**, ha van előrehaladásod. Ez írja felül az elavult
 *      „tervezett"-et — aki már belekezdett, annak a lista ne azt írja, hogy
 *      majd fogja.
 *   4. **tervezett**, ha így jelölted, és a fentiek egyike sem áll.
 *
 * Ami egyikbe sem esik, az nincs a listán.
 */

export type WatchlistStatus = 'PLANNED' | 'WATCHING' | 'COMPLETED' | 'DROPPED';

export const WATCHLIST_LABELS: Record<WatchlistStatus, string> = {
  PLANNED: 'Tervezett',
  WATCHING: 'Nézem',
  COMPLETED: 'Befejezett',
  DROPPED: 'Elhagyott',
};

/** A négy állapot megjelenítési sorrendje a profil oldalon. */
export const WATCHLIST_ORDER: WatchlistStatus[] = ['WATCHING', 'PLANNED', 'COMPLETED', 'DROPPED'];

export interface WatchlistSignals {
  /** `PLANNED` vagy `DROPPED`, ha a néző kézzel megjelölte. */
  mark: 'PLANNED' | 'DROPPED' | null;
  /** Hány megjelent része van a projektnek. */
  releasedEpisodes: number;
  /** Ezekből hányat kezdett el a néző (akár csak elindította). */
  startedEpisodes: number;
  /** És hányat nézett végig. */
  completedEpisodes: number;
}

/**
 * A tényleges állapot a jelekből. Tiszta függvény — nincs adatbázis, nincs
 * idő, nincs mellékhatás —, mert ez a szabálykészlet a funkció lényege, és
 * pontosan ezt kell tudni tesztelni.
 */
export function resolveWatchlistStatus(signals: WatchlistSignals): WatchlistStatus | null {
  const { mark, releasedEpisodes, startedEpisodes, completedEpisodes } = signals;

  /*
    Befejezett: minden megjelent rész végignézve.

    A `releasedEpisodes > 0` feltétel nem formalitás. Nélküle egy még meg nem
    jelent projekt — nulla rész, nulla végignézve — „befejezett"-nek
    minősülne, mert a „mindet megnézted" üresen igaz. Bejelentett sorozatok
    tömege kerülne a kész listára.
  */
  if (releasedEpisodes > 0 && completedEpisodes >= releasedEpisodes) return 'COMPLETED';

  if (mark === 'DROPPED') return 'DROPPED';
  if (startedEpisodes > 0) return 'WATCHING';
  if (mark === 'PLANNED') return 'PLANNED';

  return null;
}
