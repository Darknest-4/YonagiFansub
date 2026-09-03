import 'server-only';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { assertPublicHost, BlockedAddressError, guardedLookup } from '@/features/video/ssrf';
import type { AvailabilityResult } from '@/features/video/adapters/contract';

/**
 * Egy cím megkopogtatása, biztonságosan.
 *
 * ## Miért nem `fetch`
 *
 * Mert a `fetch` nem enged saját névfeloldót. Egy állapotellenőrzés kimenő
 * kérést indít **admin által megadott** címre, ami tankönyvi SSRF-felület: aki
 * felvehet egy forrást, az a szerverünkkel kéret le bármit, amit a szerver
 * elér — belső szolgáltatásokat, felhő-metaadat végpontot. A `node:https`
 * `lookup` kampója az egyetlen pont, ahol a feloldott cím még a kapcsolat
 * megnyitása előtt elutasítható, és ahol egy visszakötési kísérlet (a név
 * publikus és privát címre is felold) is elbukik.
 *
 * A védelem két helyen van, és ez nem redundancia: a literális IP-t tartalmazó
 * URL sosem jut el a névfeloldóig, azt a `assertPublicHost` fogja meg.
 *
 * ## Miért HEAD, és miért esik vissza GET-re
 *
 * A HEAD nem tölt le semmit — egy állapotellenőrzésnek pont ennyi kell. Sok
 * tárhely viszont 405-öt ad rá; ilyenkor egy `Range: bytes=0-0` GET ugyanazt
 * megmondja néhány bájt árán.
 */

export interface ProbeOptions {
  timeoutMs?: number;
  /** Elfogadható tartalomtípusok. Üres lista: bármi jó. */
  expectContentTypes?: readonly string[];
}

export interface ProbeResult extends AvailabilityResult {
  statusCode: number | null;
  contentType: string | null;
  contentLength: number | null;
}

const DEFAULT_TIMEOUT_MS = 8_000;

/** Az elfogadható lassúság határa; efölött él, de akadozónak számít. */
export const SLOW_RESPONSE_MS = 2_500;

function fail(detail: string, latencyMs: number | null): ProbeResult {
  return { state: 'UNAVAILABLE', detail, latencyMs, statusCode: null, contentType: null, contentLength: null };
}

/**
 * Egyetlen kérés, átirányítás-követés nélkül.
 *
 * Az átirányítást kimondottan **nem** követjük automatikusan a kérésben: minden
 * ugrást újra ellenőrizni kell, különben egy publikus cím egyetlen 302-vel
 * behúzhat egy belső hálózati címre. A `probeUrl` maga lépteti tovább, korlátos
 * számban, és minden lépésre újra lefuttatja a védelmet.
 */
function once(url: URL, timeoutMs: number): Promise<ProbeResult & { location: string | null }> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let settled = false;

    const finish = (value: ProbeResult & { location: string | null }) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    try {
      assertPublicHost(url.hostname);
    } catch (error) {
      finish({
        ...fail(
          error instanceof BlockedAddressError
            ? 'A cím nem nyilvános hálózatra mutat.'
            : 'Érvénytelen cím.',
          null,
        ),
        location: null,
      });
      return;
    }

    const send = url.protocol === 'http:' ? httpRequest : httpsRequest;

    const send_ = (method: 'HEAD' | 'GET') => {
      const req = send(
        url,
        {
          method,
          lookup: guardedLookup,
          timeout: timeoutMs,
          headers: {
            // Néhány tárhely a fejléc nélküli kérést botnak nézi és eldobja.
            'user-agent': 'YonagiFansub-HealthCheck/1.0',
            ...(method === 'GET' ? { range: 'bytes=0-0' } : {}),
          },
        },
        (res) => {
          const latencyMs = Date.now() - startedAt;
          const status = res.statusCode ?? 0;

          // A törzset eldobjuk: egy állapotellenőrzésnek nem kell a fájl.
          res.resume();

          if (method === 'HEAD' && (status === 405 || status === 501)) {
            // A szolgáltató nem tud HEAD-et. Nem hiba — kérdezzük másképp.
            send_('GET');
            return;
          }

          finish({
            state: status >= 200 && status < 400 ? 'AVAILABLE' : 'UNAVAILABLE',
            detail: `HTTP ${status}`,
            latencyMs,
            statusCode: status,
            contentType: res.headers['content-type']?.split(';')[0]?.trim() ?? null,
            contentLength: res.headers['content-length']
              ? Number(res.headers['content-length'])
              : null,
            location: typeof res.headers.location === 'string' ? res.headers.location : null,
          });
        },
      );

      req.on('timeout', () => {
        req.destroy();
        finish({ ...fail(`Időtúllépés ${timeoutMs} ms után.`, timeoutMs), location: null });
      });

      req.on('error', (error) => {
        const blocked = error instanceof BlockedAddressError;
        finish({
          ...fail(
            blocked ? 'A cím nem nyilvános hálózatra mutat.' : 'Nem sikerült kapcsolódni.',
            Date.now() - startedAt,
          ),
          location: null,
        });
      });

      req.end();
    };

    send_('HEAD');
  });
}

const MAX_REDIRECTS = 3;

export async function probeUrl(rawUrl: string, options: ProbeOptions = {}): Promise<ProbeResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return fail('Értelmezhetetlen cím.', null);
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return fail('Csak http és https ellenőrizhető.', null);
  }

  let latencyTotal = 0;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const result = await once(url, timeoutMs);
    latencyTotal += result.latencyMs ?? 0;

    const redirecting =
      result.statusCode !== null &&
      result.statusCode >= 300 &&
      result.statusCode < 400 &&
      result.location;

    if (!redirecting) {
      const withLatency = { ...result, latencyMs: latencyTotal || result.latencyMs };

      if (
        withLatency.state === 'AVAILABLE' &&
        options.expectContentTypes?.length &&
        withLatency.contentType &&
        !options.expectContentTypes.includes(withLatency.contentType)
      ) {
        return {
          ...withLatency,
          state: 'UNAVAILABLE',
          detail: `Váratlan tartalomtípus: ${withLatency.contentType}`,
        };
      }

      return withLatency;
    }

    try {
      // Az új cím a réginek a bázisa: a relatív `Location` így is helyes lesz.
      url = new URL(result.location!, url);
    } catch {
      return fail('Az átirányítás célja értelmezhetetlen.', latencyTotal);
    }
  }

  return fail(`Túl sok átirányítás (${MAX_REDIRECTS}).`, latencyTotal);
}
