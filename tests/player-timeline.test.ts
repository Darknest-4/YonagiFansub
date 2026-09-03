import { describe, expect, it } from 'vitest';
import {
  PLAYBACK_RATES,
  autoNextRemaining,
  autoNextStartSec,
  bufferedAhead,
  clampTime,
  formatTime,
  isMarkerActive,
  nextRate,
  seekFromRatio,
  spokenTime,
} from '@/features/video/player/timeline';
import {
  SEEK_STEP_SEC,
  SHORTCUT_HELP,
  isTypingTarget,
  resolveAction,
  type KeyEventLike,
} from '@/features/video/player/keyboard';

/**
 * A lejátszó időbeli és billentyűzet-logikája.
 *
 * Ezek nézés közben, másodpercenként többször futnak, és a hibáik pont olyanok,
 * amiket kézzel próbálva nem lehet elkapni: egy gomb, ami egy pillanatra
 * felvillan rossz helyen, vagy egy elnyelt szóköz egy hozzászólás közepén.
 */

describe('időformázás', () => {
  it('rövid részeknél nincs óra', () => {
    expect(formatTime(754)).toBe('12:34');
  });

  it('nulla is olvasható', () => {
    expect(formatTime(0)).toBe('0:00');
  });

  it('hosszú tartalomnál megjelenik az óra', () => {
    expect(formatTime(3725)).toBe('1:02:05');
  });

  /*
    A számláló a TELJES hosszhoz igazodik, nem a pillanatnyihoz. Enélkül egy
    kétórás film számlálója elugrana, amikor átlépi az egy órát — a `59:59`
    után `1:00:00` jönne, más szélességgel.
  */
  it('a formátumot a teljes hossz dönti el, nem a pillanatnyi idő', () => {
    expect(formatTime(30, 7200)).toBe('0:00:30');
    expect(formatTime(30, 600)).toBe('0:30');
  });

  it('értelmetlen bemenetre nem omlik el', () => {
    expect(formatTime(NaN)).toBe('0:00');
    expect(formatTime(-5)).toBe('0:00');
    expect(formatTime(Infinity)).toBe('0:00');
  });

  it('a felolvasott alak szavakat használ, nem kettőspontot', () => {
    expect(spokenTime(754)).toBe('12 perc 34 másodperc');
    expect(spokenTime(3600)).toBe('1 óra');
    expect(spokenTime(0)).toBe('0 másodperc');
  });
});

describe('pozíció és tekerés', () => {
  it('a tartományon kívüli érték a szélére kerül', () => {
    expect(clampTime(-10, 100)).toBe(0);
    expect(clampTime(500, 100)).toBe(100);
  });

  it('ismeretlen hossznál csak a negatívot vágja', () => {
    expect(clampTime(500, NaN)).toBe(500);
    expect(clampTime(-1, NaN)).toBe(0);
  });

  /*
    Egérhúzásnál a mutató kimegy a sáv alól, és olyankor a szélső érték a helyes
    válasz — nem hiba, és nem is szabad ugrálnia.
  */
  it('a sávon kívüli húzás a szélére visz', () => {
    expect(seekFromRatio(-0.3, 1000)).toBe(0);
    expect(seekFromRatio(1.4, 1000)).toBe(1000);
  });

  it('a sáv közepe a felezőpont', () => {
    expect(seekFromRatio(0.5, 1400)).toBe(700);
  });

  it('nulla hosszú videón nem oszt nullával', () => {
    expect(seekFromRatio(0.5, 0)).toBe(0);
  });
});

describe('főcím-átugrás', () => {
  const intro = { startSec: 60, endSec: 150 };

  it('a szakaszon belül látszik', () => {
    expect(isMarkerActive(intro, 90)).toBe(true);
  });

  it('előtte nem', () => {
    expect(isMarkerActive(intro, 59)).toBe(false);
  });

  /*
    Az utolsó másodpercekben felvillanó gomb már semmit nem spórol, viszont pont
    akkor takarja a képet, amikor a jelenet visszatér.
  */
  it('a szakasz legvégén már nem', () => {
    expect(isMarkerActive(intro, 149)).toBe(false);
    expect(isMarkerActive(intro, 147.5)).toBe(true);
  });

  it('bemérés nélkül soha', () => {
    expect(isMarkerActive({ startSec: null, endSec: null }, 90)).toBe(false);
    expect(isMarkerActive({ startSec: 60, endSec: null }, 90)).toBe(false);
  });

  it('értelmetlen szakaszt figyelmen kívül hagy', () => {
    expect(isMarkerActive({ startSec: 150, endSec: 60 }, 100)).toBe(false);
    expect(isMarkerActive({ startSec: 60, endSec: 60 }, 60)).toBe(false);
  });
});

describe('a következő rész visszaszámlálása', () => {
  it('a végefőcím kezdetétől indul, ha be van mérve', () => {
    expect(autoNextStartSec(1400, 1320)).toBe(1320);
  });

  it('bemérés nélkül a hossz végéből számol', () => {
    expect(autoNextStartSec(1400, null, 20)).toBe(1380);
  });

  it('értelmetlen végefőcímet nem fogad el', () => {
    // A hossznál későbbi kezdet nem lehet valós — visszaesik az alapértelmezésre.
    expect(autoNextStartSec(1400, 9999, 20)).toBe(1380);
    expect(autoNextStartSec(1400, 0, 20)).toBe(1380);
  });

  it('nagyon rövid tartalomnál nincs visszaszámlálás', () => {
    expect(autoNextStartSec(10, null, 20)).toBeNull();
    expect(autoNextStartSec(0, null)).toBeNull();
  });

  it('a szakasz előtt nincs mit visszaszámlálni', () => {
    expect(autoNextRemaining(500, 1400, 1320)).toBeNull();
  });

  /*
    A visszaszámlálás a VIDEÓ idejéhez kötött, nem faliórához: szüneteltetve
    megáll, visszatekerve újraindul, és nem lép tovább a néző háta mögött.
  */
  it('a videó idejéből számol, tehát szünetben áll', () => {
    expect(autoNextRemaining(1320, 1400, 1320, 10)).toBe(10);
    expect(autoNextRemaining(1325, 1400, 1320, 10)).toBe(5);
    // Ugyanaz a pillanat kétszer kérdezve ugyanazt adja — nincs falióra.
    expect(autoNextRemaining(1325, 1400, 1320, 10)).toBe(5);
  });

  it('lejárva nullát ad, nem negatívot', () => {
    expect(autoNextRemaining(1399, 1400, 1320, 10)).toBe(0);
  });

  it('visszatekerve újraindul', () => {
    expect(autoNextRemaining(1329, 1400, 1320, 10)).toBe(1);
    expect(autoNextRemaining(1321, 1400, 1320, 10)).toBe(9);
  });
});

describe('puffer', () => {
  /*
    Visszatekerés után a `TimeRanges` több, nem összefüggő szakaszt tartalmaz.
    A legelső szakasz végét mutatni egyenesen félrevezető: a néző azt hinné,
    van előtte puffer, pedig ott áll, ahol semmi nincs betöltve.
  */
  it('a jelenlegi pozíciót tartalmazó szakaszt nézi, nem az elsőt', () => {
    const ranges = [
      { start: 0, end: 120 },
      { start: 600, end: 700 },
    ];
    expect(bufferedAhead(ranges, 610)).toBe(90);
  });

  it('szakaszon kívül nincs puffer', () => {
    expect(bufferedAhead([{ start: 0, end: 100 }], 300)).toBe(0);
  });

  it('üres listánál nulla', () => {
    expect(bufferedAhead([], 10)).toBe(0);
  });
});

describe('lejátszási sebesség', () => {
  it('a normál sebesség szerepel a listában', () => {
    expect(PLAYBACK_RATES).toContain(1);
  });

  it('léptet fel és le', () => {
    expect(nextRate(1, 1)).toBe(1.25);
    expect(nextRate(1, -1)).toBe(0.75);
  });

  it('a széleken megáll, nem fordul körbe', () => {
    expect(nextRate(2, 1)).toBe(2);
    expect(nextRate(0.5, -1)).toBe(0.5);
  });

  it('ismeretlen sebességről a normálhoz képest lép', () => {
    expect(nextRate(1.13, 1)).toBe(1.25);
  });
});

describe('gyorsbillentyűk', () => {
  const key = (over: Partial<KeyEventLike>): KeyEventLike => ({
    key: 'a',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...over,
  });

  it('a leírásban kért billentyűk mind működnek', () => {
    expect(resolveAction(key({ key: ' ' }))).toBe('toggle-play');
    expect(resolveAction(key({ key: 'ArrowLeft' }))).toBe('seek-back');
    expect(resolveAction(key({ key: 'ArrowRight' }))).toBe('seek-forward');
    expect(resolveAction(key({ key: 'ArrowUp' }))).toBe('volume-up');
    expect(resolveAction(key({ key: 'ArrowDown' }))).toBe('volume-down');
    expect(resolveAction(key({ key: 'm' }))).toBe('toggle-mute');
    expect(resolveAction(key({ key: 'f' }))).toBe('toggle-fullscreen');
    expect(resolveAction(key({ key: 'p' }))).toBe('toggle-pip');
    expect(resolveAction(key({ key: 'c' }))).toBe('toggle-subtitles');
  });

  it('nagybetűvel is', () => {
    expect(resolveAction(key({ key: 'F', shiftKey: true }))).toBe('toggle-fullscreen');
  });

  /*
    A Ctrl+F keresés, nem teljes képernyő. Egy lejátszó, ami elveszi a
    böngésző parancsait, minden nézőt megbosszant.
  */
  it('módosítóval lenyomott billentyűt nem vesz el a böngészőtől', () => {
    expect(resolveAction(key({ key: 'f', ctrlKey: true }))).toBeNull();
    expect(resolveAction(key({ key: 'f', metaKey: true }))).toBeNull();
    expect(resolveAction(key({ key: 'ArrowLeft', altKey: true }))).toBeNull();
  });

  it('ismeretlen billentyűre nem történik semmi', () => {
    expect(resolveAction(key({ key: 'q' }))).toBeNull();
    expect(resolveAction(key({ key: 'Escape' }))).toBeNull();
  });

  it('a súgó minden sora valódi billentyűt ír le', () => {
    expect(SHORTCUT_HELP.length).toBeGreaterThan(5);
    expect(SHORTCUT_HELP.some((row) => row.label.includes(String(SEEK_STEP_SEC)))).toBe(true);
  });
});

describe('mikor NEM szabad elkapni a billentyűt', () => {
  /*
    Ez a hiba a fejlesztő gépén sosem jön elő, mert ő nem szokott a videó alatt
    kommentelni. A nézőnél viszont az első alkalommal: gépel, leüt egy szóközt,
    és a videó megáll.
  */
  it('szövegmezőben gépelve nem', () => {
    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTypingTarget({ tagName: 'SELECT' })).toBe(true);
  });

  it('szerkeszthető elemben sem', () => {
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });

  it('szerep szerinti szövegmezőben sem', () => {
    expect(
      isTypingTarget({ tagName: 'DIV', getAttribute: (name) => (name === 'role' ? 'textbox' : null) }),
    ).toBe(true);
  });

  it('sima elemen viszont igen', () => {
    expect(isTypingTarget({ tagName: 'DIV' })).toBe(false);
    expect(isTypingTarget({ tagName: 'BUTTON' })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
