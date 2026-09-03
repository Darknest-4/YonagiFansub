import 'server-only';
import { mediaDriver } from '@/infrastructure/storage/driver';
import { buildEmbedUrl, isAllowedUrl } from '@/features/video/provider';
import { probeUrl, SLOW_RESPONSE_MS } from '@/features/video/adapters/probe';
import {
  DEFAULT_CAPABILITIES,
  unknownAvailability,
  type AdapterSource,
  type AvailabilityResult,
  type SourceMetadata,
  type VideoProviderAdapter,
} from '@/features/video/adapters/contract';

/**
 * A ma létező adapterek.
 *
 * Három van, mert három útja van annak, hogy egy videó jogszerűen eljusson a
 * nézőhöz: a sajátunk, egy nyilvános fájl, és egy szolgáltató saját lejátszója.
 * A negyedikhez — egy hivatalos szolgáltatói API-hoz — ugyanez a szerződés áll
 * rendelkezésre, és a `resolveAdapter` egyetlen sorral bővül.
 *
 * Egyik sem szerez meg olyan címet, amit a szolgáltató nem adott oda.
 */

/**
 * A saját tárhelyünk.
 *
 * Ez az egyetlen adapter, ami nem a hálózaton kérdez: a fájl nálunk van, tehát
 * a tárolóhoz fordulunk. Egy HTTP-kérés saját magunkhoz körbefordulás lenne, és
 * ráadásul félrevezető: ha az alkalmazás nem válaszol, nem a videóforrás rossz.
 */
export const ownStorageAdapter: VideoProviderAdapter = {
  key: 'own-storage',
  displayName: 'Saját tárhely (HLS)',
  protocol: 'HLS',
  capabilities: {
    ...DEFAULT_CAPABILITIES,
    supportsHLS: true,
    supportsSubtitles: true,
    supportsQualitySelection: true,
  },

  async checkAvailability(source: AdapterSource): Promise<AvailabilityResult> {
    if (!source.masterKey) {
      return { state: 'UNAVAILABLE', detail: 'Nincs megadva tárolási kulcs.', latencyMs: null };
    }

    const startedAt = Date.now();
    try {
      /*
        Egyetlen bájt.

        A driveren nincs külön létezés-ellenőrzés, viszont a tartományos kérést
        ismeri — és egy `bytes=0-0` pontosan ugyanazt mondja meg, mint egy HEAD,
        anélkül hogy egy master playlistet végigolvasnánk minden ellenőrzésnél.
      */
      const object = await mediaDriver().get(source.masterKey, 'bytes=0-0');
      const latencyMs = Date.now() - startedAt;

      if (!object) {
        return { state: 'UNAVAILABLE', detail: 'A tárolóban nincs ilyen fájl.', latencyMs };
      }
      return { state: 'AVAILABLE', detail: 'A csomag a helyén van.', latencyMs };
    } catch {
      /*
        Nem `UNAVAILABLE`.

        Ha a tároló maga nem válaszol, arról nem a videóforrás tehet — és ha
        ilyenkor halottnak jelölnénk, egy percnyi S3-kimaradás az összes saját
        forrásunkat kivenné a láncból.
      */
      return {
        state: 'UNKNOWN',
        detail: 'A tároló most nem válaszol — az állapot nem állapítható meg.',
        latencyMs: Date.now() - startedAt,
      };
    }
  },

  async healthCheck(): Promise<AvailabilityResult> {
    // A saját tárhely „állapota" az alkalmazásé: ha ez a kód fut, a tároló
    // konfigurációja betöltődött. Ennél többet állítani félrevezető lenne.
    return { state: 'AVAILABLE', detail: 'Saját tároló.', latencyMs: null };
  },

  async getMetadata(source: AdapterSource): Promise<SourceMetadata | null> {
    if (!source.masterKey) return null;
    try {
      const object = await mediaDriver().get(source.masterKey, 'bytes=0-0');
      if (!object) return null;
      return {
        durationSec: null,
        contentType: object.contentType,
        /*
          Tartományos válasznál a `contentLength` az egy bájt, nem a fájl mérete.
          A teljes méret a `Content-Range` végén áll — ha a driver adta.
        */
        sizeBytes: Number(object.contentRange?.split('/')[1] ?? '') || null,
        qualities: [],
      };
    } catch {
      return null;
    }
  },
};

/**
 * Közvetlen fájl valahol máshol.
 *
 * Itt van értelme HTTP-vel kopogtatni, és itt kell a legszigorúbb SSRF-védelem:
 * a cím adminból jön, tehát az, aki forrást vehet fel, a szerverünkkel kéret le
 * valamit. A `probeUrl` minden átirányítási lépésre újra ellenőriz.
 */
export const directFileAdapter: VideoProviderAdapter = {
  key: 'direct-file',
  displayName: 'Közvetlen fájl',
  protocol: 'MP4',
  capabilities: {
    ...DEFAULT_CAPABILITIES,
    supportsDirectMP4: true,
    supportsSubtitles: true,
  },

  async checkAvailability(source: AdapterSource): Promise<AvailabilityResult> {
    if (!source.sourceUrl) {
      return { state: 'UNAVAILABLE', detail: 'Nincs megadva URL.', latencyMs: null };
    }

    /*
      Ha a forráshoz tartozik szolgáltató bejegyzett domainekkel, a cím ellen
      kell mennie. Ez nem formaság: enélkül egy elgépelt vagy átírt URL a
      szolgáltató nevében mutatna máshova, és az ellenőrzés azt igazolná vissza,
      hogy „a szolgáltató rendben van".
    */
    if (source.provider && source.provider.domains.length > 0) {
      if (!isAllowedUrl({ ...source.provider, urlPatterns: [] }, source.sourceUrl)) {
        return {
          state: 'UNAVAILABLE',
          detail: 'A cím nem a szolgáltatóhoz bejegyzett domainre mutat.',
          latencyMs: null,
        };
      }
    }

    const result = await probeUrl(source.sourceUrl);
    return { state: result.state, detail: result.detail, latencyMs: result.latencyMs };
  },

  async healthCheck(): Promise<AvailabilityResult> {
    // Nincs mit kérdezni: a „közvetlen fájl" nem egy szolgáltató, hanem egy mód.
    // Az egyes fájlok állapota forrásonként dől el.
    return unknownAvailability('Forrásonként ellenőrzött.');
  },

  async getMetadata(source: AdapterSource): Promise<SourceMetadata | null> {
    if (!source.sourceUrl) return null;
    const result = await probeUrl(source.sourceUrl);
    if (result.state !== 'AVAILABLE') return null;
    return {
      durationSec: null,
      contentType: result.contentType,
      sizeBytes: result.contentLength,
      qualities: [],
    };
  },
};

/**
 * Beágyazott lejátszó.
 *
 * Amit ellenőrizni tudunk, az az, hogy a szolgáltató oldala válaszol-e a
 * beágyazási címre. Azt **nem** tudjuk, és nem is próbáljuk, hogy mögötte
 * milyen videó van: az az ő lejátszójuk dolga. A cím a saját sablonjukból áll
 * elő, tehát olyat kérdezünk, amit ők maguk adtak ki.
 */
export const embedAdapter: VideoProviderAdapter = {
  key: 'embed',
  displayName: 'Beágyazott lejátszó',
  protocol: 'EMBED',
  capabilities: {
    ...DEFAULT_CAPABILITIES,
    // A szolgáltató lejátszója a saját feliratait és minőségeit kezeli; mi nem
    // fűzünk hozzá sávot, és nem választunk benne felbontást.
    supportsQualitySelection: false,
  },

  async checkAvailability(source: AdapterSource): Promise<AvailabilityResult> {
    if (!source.provider) {
      return { state: 'UNAVAILABLE', detail: 'Nincs szolgáltató rendelve.', latencyMs: null };
    }
    if (!source.externalId) {
      return { state: 'UNAVAILABLE', detail: 'Nincs megadva azonosító.', latencyMs: null };
    }

    const url = buildEmbedUrl({ ...source.provider, urlPatterns: [] }, source.externalId);
    if (!url) {
      return { state: 'UNAVAILABLE', detail: 'A szolgáltatónak nincs beágyazási sablonja.', latencyMs: null };
    }

    const result = await probeUrl(url);
    return { state: result.state, detail: result.detail, latencyMs: result.latencyMs };
  },

  async healthCheck(): Promise<AvailabilityResult> {
    return unknownAvailability('A szolgáltató állapota a forrásaiból derül ki.');
  },

  async getMetadata(): Promise<SourceMetadata | null> {
    /*
      Szándékosan `null`.

      A hossz és a felbontás a szolgáltató oldalán van. Kideríteni csak úgy
      lehetne, hogy az oldalukat letöltjük és elemezzük — az pedig pont az,
      amit nem csinálunk.
    */
    return null;
  },
};

const ADAPTERS: Record<string, VideoProviderAdapter> = {
  HLS_PROXY: ownStorageAdapter,
  DIRECT_FILE: directFileAdapter,
  EMBED: embedAdapter,
};

/**
 * Melyik adapter szolgálja ki ezt a forrást.
 *
 * A forrás fajtája dönt, nem a szolgáltató neve — így egy új szolgáltató
 * felvétele nem igényel kódot, csak egy sort az adatbázisban. Egy valódi
 * szolgáltatói API-hoz saját fajta és saját adapter kerülne ide, egy sorral.
 */
export function resolveAdapter(kind: string): VideoProviderAdapter | null {
  return ADAPTERS[kind] ?? null;
}

export function listAdapters(): VideoProviderAdapter[] {
  return Object.values(ADAPTERS);
}

export { SLOW_RESPONSE_MS };
