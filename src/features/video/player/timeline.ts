/**
 * A lejátszó időbeli logikája, felület nélkül.
 *
 * Minden itt lévő függvény tiszta: számokat kap, számokat ad. Ez azért fontos,
 * mert ezek a döntések nézés közben, másodpercenként többször futnak le, és a
 * hibáik pont olyanok, amiket kézzel próbálva nem lehet elkapni — egy „Főcím
 * átugrása” gomb, ami egy pillanatra felvillan a rész közepén, vagy egy
 * visszaszámláló, ami a szünet alatt is fut.
 */

/**
 * Idő emberi alakban.
 *
 * Óra csak akkor, ha van: egy húszperces résznél az `00:12:34` három fölösleges
 * karakter, és minden pillantásnál újra el kell olvasni. A hossz ismeretében a
 * **teljes** időhöz igazodik, nem a pillanatnyihoz — különben a számláló
 * elugrana, amikor átlépi az egy órát.
 */
export function formatTime(seconds: number, totalSeconds?: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';

  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;

  const reference = Number.isFinite(totalSeconds ?? NaN) ? (totalSeconds as number) : seconds;
  const showHours = reference >= 3600;

  const pad = (value: number) => String(value).padStart(2, '0');

  return showHours ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

/**
 * A képernyőolvasónak szánt alak.
 *
 * A `12:34` felolvasva „tizenkettő kettőspont harmincnégy”, ami nem idő. Ez a
 * változat kimondja: „12 perc 34 másodperc”.
 */
export function spokenTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0 másodperc';

  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} óra`);
  if (minutes > 0) parts.push(`${minutes} perc`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs} másodperc`);

  return parts.join(' ');
}

/** Egy pozíció a [0, hossz] tartományba szorítva. */
export function clampTime(position: number, duration: number): number {
  if (!Number.isFinite(position)) return 0;
  if (!Number.isFinite(duration) || duration <= 0) return Math.max(0, position);
  return Math.min(Math.max(0, position), duration);
}

/**
 * A haladássávon való kattintás pozíciója.
 *
 * A `ratio` a sáv bal szélétől mért arány. Kívül eső értéket is elfogad, mert
 * egérhúzásnál a mutató simán kimegy az elem alól — és olyankor a szélső érték a
 * helyes válasz, nem a hiba.
 */
export function seekFromRatio(ratio: number, duration: number): number {
  if (!Number.isFinite(ratio) || !Number.isFinite(duration) || duration <= 0) return 0;
  return clampTime(ratio * duration, duration);
}

export interface SkipMarker {
  startSec: number | null;
  endSec: number | null;
}

/**
 * Látszódjon-e most az „átugrás” gomb.
 *
 * Két szabály, mindkettő tapasztalatból:
 *
 * 1. **Csak a szakaszon belül.** Egy gomb, ami a szakasz előtt jelenik meg,
 *    átugrasztaná a néző fejét is a jelenet fölött.
 * 2. **Nem a legvégén.** Az utolsó másodpercekben felvillanó gomb már semmit
 *    nem spórol, viszont pont akkor takarja a képet, amikor a jelenet
 *    visszatér. A `tailSec` ezt a farkat vágja le.
 */
export function isMarkerActive(
  marker: SkipMarker,
  currentSec: number,
  tailSec = 2,
): boolean {
  if (marker.startSec === null || marker.endSec === null) return false;
  if (marker.endSec <= marker.startSec) return false;

  return currentSec >= marker.startSec && currentSec < marker.endSec - tailSec;
}

/**
 * Mikor kezdjen visszaszámlálni a következő rész.
 *
 * A végefőcím kezdetétől, ha be van mérve — így a néző még a stáblista alatt
 * dönthet. Ha nincs, a hossz utolsó másodpercei. A `null` azt jelenti, hogy
 * nincs mit visszaszámlálni.
 */
export function autoNextStartSec(
  duration: number,
  outroStartSec: number | null,
  fallbackTailSec = 20,
): number | null {
  if (!Number.isFinite(duration) || duration <= 0) return null;

  if (outroStartSec !== null && outroStartSec > 0 && outroStartSec < duration) {
    return outroStartSec;
  }

  const start = duration - fallbackTailSec;
  return start > 0 ? start : null;
}

/**
 * Hány másodperc van hátra a következő részig.
 *
 * `null`, ha még nem tart ott. A visszaszámlálás **a videó idejéhez** kötött,
 * nem faliórához: szüneteltetve megáll, visszatekerve újraindul, és nem lép
 * tovább a néző háta mögött.
 */
export function autoNextRemaining(
  currentSec: number,
  duration: number,
  outroStartSec: number | null,
  countdownSec = 10,
): number | null {
  const start = autoNextStartSec(duration, outroStartSec);
  if (start === null || currentSec < start) return null;

  const elapsed = currentSec - start;
  const remaining = Math.ceil(countdownSec - elapsed);
  return Math.max(0, remaining);
}

/**
 * A puffer állapota a jelenlegi pozíciónál.
 *
 * A `TimeRanges` több, nem összefüggő szakaszt tartalmazhat (visszatekerés után
 * kettő is lehet). Azt keressük, amelyikben épp benne vagyunk — a többi
 * érdektelen, és a legelső szakasz végét mutatni egyenesen félrevezető lenne.
 */
export function bufferedAhead(
  ranges: readonly { start: number; end: number }[],
  currentSec: number,
): number {
  const containing = ranges.find(
    (range) => currentSec >= range.start - 0.5 && currentSec <= range.end,
  );
  return containing ? Math.max(0, containing.end - currentSec) : 0;
}

/** A felajánlott lejátszási sebességek. */
export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export type PlaybackRate = (typeof PLAYBACK_RATES)[number];

export function nextRate(current: number, direction: 1 | -1): PlaybackRate {
  const index = PLAYBACK_RATES.indexOf(current as PlaybackRate);
  const from = index === -1 ? PLAYBACK_RATES.indexOf(1) : index;
  const target = Math.min(Math.max(0, from + direction), PLAYBACK_RATES.length - 1);
  return PLAYBACK_RATES[target]!;
}
