/**
 * Amit egy videószolgáltatótól elvárunk.
 *
 * ## Miért interfész, és nem elágazások
 *
 * A rendszer ma háromféle forrást ismer: saját HLS-csomagot, közvetlen fájlt és
 * beágyazást. Ez a három **nem** a végleges lista — a lényeg épp az, hogy a
 * negyedik hozzáadása egy fájl legyen, ne egy kereséssel megtalált tucatnyi
 * `if (kind === …)` átírása. Ezért van itt egy szerződés, és ezért nincs
 * szolgáltatóspecifikus logika sehol máshol.
 *
 * ## Amit egy adapter NEM csinál
 *
 * Nem szerez meg olyan címet, amit a szolgáltató nem adott oda. Nincs
 * oldalletöltés-elemzés, nincs rejtett végpont-kitalálás, nincs lejárt token
 * újrahasznosítás. Egy adapter vagy a **mi** tárhelyünkkel dolgozik, vagy egy
 * olyan címmel, amit a szolgáltató nyilvánosan és szándékosan ad ki
 * beágyazásra. Ha egy szolgáltatóhoz nincs ilyen út, ahhoz nem készül adapter.
 *
 * ## A képességek nem díszek
 *
 * A `supports*` mezők valódi döntéseket vezérelnek: a feloldó ezek alapján
 * tudja, hogy egy forrás mögött van-e adaptív bitráta, a lejátszó pedig, hogy
 * felajánlhat-e hozzá feliratsávot. Egy adapter, ami mindenre igazat mond,
 * pontosan annyit ér, mint egy, ami semmire.
 */

export type PlaybackProtocol = 'HLS' | 'DASH' | 'MP4' | 'EMBED';

/** Amit egy adapter tud. A feloldó és a lejátszó ebből dönt. */
export interface ProviderCapabilities {
  /** Adaptív bitráta: a stream maga vált minőséget. */
  supportsHLS: boolean;
  /**
   * DASH. Ma egyetlen adapter sem szolgál ki ilyet, és ez szándékos: a mező
   * azért van itt, hogy amikor lesz, a lejátszó már tudja, mit kérdezzen —
   * nem azért, hogy úgy tegyünk, mintha kész lenne.
   */
  supportsDASH: boolean;
  /** Sima progresszív fájl. A legmegbízhatóbb visszaesés. */
  supportsDirectMP4: boolean;
  /** Külön feliratsáv fűzhető-e hozzá, vagy a kép már tartalmazza. */
  supportsSubtitles: boolean;
  /** Több felbontás közül választhat-e a néző ezen a szolgáltatón. */
  supportsQualitySelection: boolean;
}

/** Egy szolgáltató által kínált konkrét minőség. */
export interface ProviderQuality {
  label: string;
  heightPx: number | null;
  bitrateKbps: number | null;
}

export type AvailabilityState = 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN';

export interface AvailabilityResult {
  state: AvailabilityState;
  /** Rövid, ember által olvasható ok. Sosem tartalmaz hitelesítő adatot. */
  detail: string;
  latencyMs: number | null;
}

/** Amit egy adapter egy forrásról tud, anélkül hogy lejátszaná. */
export interface SourceMetadata {
  durationSec: number | null;
  contentType: string | null;
  sizeBytes: number | null;
  qualities: ProviderQuality[];
}

/**
 * A forrás, ahogy az adapter látja.
 *
 * Szándékosan szűk: az adapternek nem kell tudnia, melyik epizódhoz tartozik,
 * ki a néző, vagy mikor jelent meg. Csak azt, amiből a saját dolgát elvégzi.
 */
export interface AdapterSource {
  id: string;
  kind: string;
  masterKey: string | null;
  externalId: string | null;
  sourceUrl: string | null;
  provider: {
    slug: string;
    name: string;
    embedTemplate: string | null;
    domains: string[];
  } | null;
}

export interface VideoProviderAdapter {
  /** Az azonosító, ami alapján egy forráshoz adapter rendelődik. */
  readonly key: string;
  readonly displayName: string;
  readonly protocol: PlaybackProtocol;
  readonly capabilities: ProviderCapabilities;

  /**
   * Elérhető-e ez a konkrét forrás.
   *
   * Nem játssza le, csak megkérdezi. A hívó rövid időkorláttal futtatja, mert
   * ez egy háttérellenőrzés — nem szabad, hogy egy lassú szolgáltató miatt
   * elhúzódjon a napi karbantartás.
   */
  checkAvailability(source: AdapterSource): Promise<AvailabilityResult>;

  /**
   * A szolgáltató általános állapota, egyetlen forrástól függetlenül.
   *
   * Külön kérdés az előzőtől: egy törölt fájl nem jelenti azt, hogy a
   * szolgáltató elesett, és egy leállt szolgáltató minden érvényes fájlt
   * elérhetetlenné tesz. A kettő összemosása mindkét irányban téves riasztást
   * szül.
   */
  healthCheck(): Promise<AvailabilityResult>;

  /**
   * Amit a forrásról meg lehet tudni lejátszás nélkül.
   *
   * `null`, ha az adapter nem tud ilyet mondani — ez nem hiba. Egy beágyazásnál
   * a hossz és a felbontás a szolgáltató oldalán van, és nem a mi dolgunk
   * kitalálni.
   */
  getMetadata(source: AdapterSource): Promise<SourceMetadata | null>;
}

/**
 * A közös rész, amit minden adapter örököl.
 *
 * Nem absztrakt osztály, hanem alapértelmezések: egy adapternek csak azt kell
 * megírnia, amiben eltér. Így egy új adapter tényleg lehet húsz sor.
 */
export const DEFAULT_CAPABILITIES: ProviderCapabilities = {
  supportsHLS: false,
  supportsDASH: false,
  supportsDirectMP4: false,
  supportsSubtitles: false,
  supportsQualitySelection: false,
};

export function unknownAvailability(detail: string): AvailabilityResult {
  return { state: 'UNKNOWN', detail, latencyMs: null };
}
