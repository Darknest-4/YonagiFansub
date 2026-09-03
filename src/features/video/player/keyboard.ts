/**
 * A lejátszó gyorsbillentyűi.
 *
 * Külön fájlban és tiszta függvényként, mert két dolgot kell egyszerre jól
 * csinálni, és mindkettőn könnyű elcsúszni:
 *
 * 1. **Mikor NEM szabad elkapni.** Ha valaki hozzászólást ír, a szóköz szóköz,
 *    nem lejátszás/szünet. Egy lejátszó, ami elnyeli a gépelést, használhatatlan
 *    — és ez pont az a hiba, ami a fejlesztő gépén sosem jön elő, mert ő nem
 *    szokott a videó alatt kommentelni.
 * 2. **A módosítók.** A `Ctrl+F` keresés, nem teljes képernyő. Módosítóval
 *    lenyomott billentyűt sosem veszünk el a böngészőtől.
 */

export type PlayerAction =
  | 'toggle-play'
  | 'seek-back'
  | 'seek-forward'
  | 'volume-up'
  | 'volume-down'
  | 'toggle-mute'
  | 'toggle-fullscreen'
  | 'toggle-pip'
  | 'toggle-subtitles'
  | 'toggle-theater'
  | 'rate-up'
  | 'rate-down'
  | 'seek-start'
  | 'seek-end';

export interface KeyEventLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * Szerkeszthető-e az elem, amin a fókusz áll.
 *
 * Nem csak `input` és `textarea`: a `contenteditable` ugyanígy gépelésre való,
 * és egy `select` fölött a nyilak a listát mozgatják, nem a videót.
 */
export function isTypingTarget(target: {
  tagName?: string;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
} | null): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;

  const tag = target.tagName?.toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;

  // Egy egyedi vezérlő, ami szerepe szerint szövegmező.
  const role = target.getAttribute?.('role');
  return role === 'textbox' || role === 'searchbox' || role === 'combobox';
}

/**
 * A leütésből melyik művelet lesz — vagy `null`, ha egyik sem.
 *
 * A `null` fontos: ilyenkor a hívó **nem** hívja meg a `preventDefault`-ot, és a
 * böngésző a szokásos módon kezeli a billentyűt.
 */
export function resolveAction(event: KeyEventLike): PlayerAction | null {
  // Módosítóval lenyomott billentyű a böngészőé. Kivétel a Shift, ami a
  // sebességléptetéshez kell, és amúgy sem foglalt böngészőparancsokra.
  if (event.ctrlKey || event.metaKey || event.altKey) return null;

  switch (event.key) {
    case ' ':
    case 'Spacebar': // régebbi böngészők
    case 'k':
    case 'K':
      return 'toggle-play';

    case 'ArrowLeft':
      return 'seek-back';
    case 'ArrowRight':
      return 'seek-forward';
    case 'ArrowUp':
      return 'volume-up';
    case 'ArrowDown':
      return 'volume-down';

    case 'm':
    case 'M':
      return 'toggle-mute';
    case 'f':
    case 'F':
      return 'toggle-fullscreen';
    case 'p':
    case 'P':
      return 'toggle-pip';
    case 'c':
    case 'C':
      return 'toggle-subtitles';
    case 't':
    case 'T':
      return 'toggle-theater';

    case '>':
      return 'rate-up';
    case '<':
      return 'rate-down';

    case 'Home':
      return 'seek-start';
    case 'End':
      return 'seek-end';

    default:
      return null;
  }
}

/** Mennyit lép egy nyíl. */
export const SEEK_STEP_SEC = 5;

/** Mennyit lép a hangerő egy nyílra. */
export const VOLUME_STEP = 0.1;

/** A gyorsbillentyűk listája a súgóhoz — egy helyen a leképezéssel. */
export const SHORTCUT_HELP: ReadonlyArray<{ keys: string; label: string }> = [
  { keys: 'Szóköz / K', label: 'Lejátszás és szünet' },
  { keys: '← →', label: `Ugrás ${SEEK_STEP_SEC} másodperccel` },
  { keys: '↑ ↓', label: 'Hangerő' },
  { keys: 'M', label: 'Némítás' },
  { keys: 'F', label: 'Teljes képernyő' },
  { keys: 'P', label: 'Kép a képben' },
  { keys: 'C', label: 'Felirat be- és kikapcsolása' },
  { keys: 'T', label: 'Mozi mód' },
  { keys: '< >', label: 'Lejátszási sebesség' },
  { keys: 'Home / End', label: 'Ugrás az elejére vagy a végére' },
];
