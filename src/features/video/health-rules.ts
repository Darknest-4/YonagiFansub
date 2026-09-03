/**
 * Egy mérésből milyen állapot lesz.
 *
 * Tiszta függvény, adatbázis és óra nélkül — mert ez az a pont, ahol egy rossz
 * döntés csendben, hetekig el tud rejtőzni. Egy túl szigorú szabály úgy vesz ki
 * működő forrásokat, hogy senki nem érti, miért „nincs elérhető videó"; egy túl
 * elnéző pedig hagyja, hogy a néző fusson bele egy halott linkbe.
 *
 * ## Miért nem tilt azonnal
 *
 * A feladatleírás kimondja: „Ne legyen agresszív automatikus tiltás." Ez itt egy
 * konkrét számot jelent. Egyetlen sikertelen ellenőrzésből **nem** lesz halott
 * forrás — abból egy hálózati zökkenő is lehet, és a büntetés (kiesés a
 * láncból) sokkal drágább, mint a haszon. Két egymást követő hiba után lesz
 * akadozó, és csak a negyediktől halott.
 *
 * ## Miért gördülő átlag
 *
 * A válaszidő önmagában zajos: egy 4 másodperces mérés lehet a szolgáltató
 * baja, de lehet a mi hálózatunké is. A gördülő átlag simít, és az új mérésnek
 * ad nagyobb súlyt, hogy egy tényleges romlás pár körön belül átüssön — de egy
 * kilógó érték egymagában ne mozdítson semmit.
 */

export type HealthStatus = 'UNKNOWN' | 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'MAINTENANCE';

export interface AvailabilitySignal {
  state: 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN';
  detail: string;
  latencyMs: number | null;
}

export interface HealthInput {
  result: AvailabilitySignal;
  previousStatus: HealthStatus;
  previousFailureCount: number;
  previousAverageLatencyMs: number | null;
  isMaintenance: boolean;
  /** Efölött a válasz lassúnak számít. */
  slowThresholdMs: number;
}

export interface HealthVerdict {
  status: HealthStatus;
  failureCount: number;
  averageLatencyMs: number | null;
  /** Sikeres mérés volt-e — ebből dől el, melyik időbélyeget frissítjük. */
  wasSuccess: boolean;
}

/** Ennyi egymást követő hiba után lesz akadozó. */
export const DEGRADE_AFTER_FAILURES = 2;

/** Ennyi után halott. */
export const OFFLINE_AFTER_FAILURES = 4;

/**
 * Az új mérés súlya a gördülő átlagban.
 *
 * 0.3: a régi érték kétharmada marad. Elég gyors ahhoz, hogy egy tartós romlás
 * három-négy körön belül látszódjon, és elég lassú ahhoz, hogy egyetlen
 * kiugrás ne mozdítsa el érdemben.
 */
const LATENCY_WEIGHT = 0.3;

export function rollingLatency(previous: number | null, sample: number | null): number | null {
  if (sample === null) return previous;
  if (previous === null) return sample;
  return Math.round(previous * (1 - LATENCY_WEIGHT) + sample * LATENCY_WEIGHT);
}

export function classifyHealth(input: HealthInput): HealthVerdict {
  const { result, previousStatus, previousFailureCount, previousAverageLatencyMs } = input;

  /*
    A kézi karbantartás mindent felülír.

    Amit ember vett ki, azt egy éjszakai ellenőrzés nem teheti vissza — különben
    a „kikapcsoltam, mert épp cserélem a fájlt" reggelre magától visszakapcsolna.
    A mérést azért elvégezzük és eltároljuk: karbantartás után jól jön tudni,
    hogy közben helyreállt-e.
  */
  if (input.isMaintenance) {
    return {
      status: 'MAINTENANCE',
      failureCount: previousFailureCount,
      averageLatencyMs: rollingLatency(previousAverageLatencyMs, result.latencyMs),
      wasSuccess: result.state === 'AVAILABLE',
    };
  }

  /*
    Az „ismeretlen” eredmény nem hiba.

    Ez akkor jön, amikor **mi** nem tudtuk megállapítani — a tároló nem
    válaszolt, nincs adapter, nincs mit mintavételezni. Ebből nem következik,
    hogy a forrás rossz, tehát a hibaszámláló nem nő, és a korábbi állapotot
    megtartjuk. Az egyetlen kivétel a még sosem ellenőrzött sor: az marad
    ismeretlen.
  */
  if (result.state === 'UNKNOWN') {
    return {
      status: previousStatus === 'MAINTENANCE' ? 'UNKNOWN' : previousStatus,
      failureCount: previousFailureCount,
      averageLatencyMs: previousAverageLatencyMs,
      wasSuccess: false,
    };
  }

  const averageLatencyMs = rollingLatency(previousAverageLatencyMs, result.latencyMs);

  if (result.state === 'AVAILABLE') {
    /*
      A siker azonnal és teljesen töröl.

      Nem fokozatosan: egy forrás, ami most válaszol, most jó. A hibák
      „emlékének” megtartása azt jelentené, hogy egy egyszer elakadt forrás
      napokig hátrébb sorolva marad, pedig semmi baja.
    */
    const slow = averageLatencyMs !== null && averageLatencyMs > input.slowThresholdMs;
    return {
      status: slow ? 'DEGRADED' : 'ONLINE',
      failureCount: 0,
      averageLatencyMs,
      wasSuccess: true,
    };
  }

  const failureCount = previousFailureCount + 1;

  return {
    status:
      failureCount >= OFFLINE_AFTER_FAILURES
        ? 'OFFLINE'
        : failureCount >= DEGRADE_AFTER_FAILURES
          ? 'DEGRADED'
          : // Az első hiba még nem változtat állapotot — csak számol.
            previousStatus === 'UNKNOWN'
            ? 'UNKNOWN'
            : previousStatus === 'MAINTENANCE'
              ? 'UNKNOWN'
              : previousStatus,
    failureCount,
    averageLatencyMs,
    wasSuccess: false,
  };
}

/**
 * Riasztásra érdemes-e az átmenet.
 *
 * Nem minden változás hír. Az `ONLINE → DEGRADED` mindennapos zaj; az
 * `→ OFFLINE` és a `OFFLINE → ONLINE` viszont pont az a két esemény, amiért egy
 * üzemeltető értesítést akar kapni.
 */
export function isAlertWorthy(previous: HealthStatus, current: HealthStatus): boolean {
  if (previous === current) return false;
  if (current === 'OFFLINE') return true;
  if (previous === 'OFFLINE' && current === 'ONLINE') return true;
  return false;
}
