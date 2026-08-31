import 'server-only';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import type { LinkAvailability } from '@prisma/client';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { assertPublicHost, BlockedAddressError, guardedLookup } from '@/lib/video/ssrf';

/**
 * Nightly download-mirror check.
 *
 * Every download link already had a state — available, degraded, dead — and the
 * public download panel already rendered it. What was missing was anything that
 * ever *set* it: the field could only be changed by hand, in the admin release
 * form. In practice that means a filehost can shut down and the site keeps
 * advertising the link as working until a viewer complains. For a fansub, where
 * the download is the product, that is the worst place to be wrong.
 *
 * ## Reading a response
 *
 * The question is "would a person clicking this get their file", and the answer
 * is not simply the status code:
 *
 * - **2xx / 3xx → available.** A filehost redirecting to its download page is
 *   working exactly as intended.
 * - **401 / 403 / 429 → degraded.** The host is up and answering; it is
 *   gatekeeping us specifically (bot protection, rate limit). Calling that dead
 *   would mark half the internet's filehosts dead.
 * - **404 / 410 → dead.** The file is gone, which is the case worth catching.
 * - **5xx, timeout, DNS failure, connection refused → degraded, not dead.** A
 *   host having a bad night is not a deleted file, and a nightly job should not
 *   hide a working mirror over one bad request.
 *
 * The asymmetry is deliberate: wrongly marking a live mirror dead costs a real
 * download, wrongly leaving a dead one up costs one confused click. Only an
 * explicit "not found" from the origin flips a link to dead.
 *
 * ## HEAD, then a one-byte GET
 *
 * Many filehosts answer HEAD with 405 or with a status that has nothing to do
 * with the file. When HEAD is not conclusive the check retries as a GET with
 * `Range: bytes=0-0` — one byte, which every CDN understands and no bandwidth
 * budget notices.
 *
 * ## Why the SSRF guard is here too
 *
 * These URLs are typed by staff, so this is the same primitive as the video
 * proxy: without an address check, "add a download link" is "make the server
 * fetch an internal address for you". It reuses `lib/video/ssrf.ts` — the same
 * connect-time check, refusing the socket rather than the string.
 */

/** Links examined per run. Keeps the nightly job's cost predictable. */
const DEFAULT_BATCH = 60;

const TIMEOUT_MS = 12_000;

/** Politeness gap between two requests to the same host. */
const HOST_GAP_MS = 1_500;

const USER_AGENT = 'Mozilla/5.0 (compatible; YonagiFansub-linkcheck/1.0)';

interface ProbeResult {
  availability: LinkAvailability;
  status: number | null;
  reason: string;
}

/**
 * The status-to-state rule, on its own so it can be tested as one.
 *
 * Exported because this asymmetry *is* the feature — 404 is the only status
 * that kills a link — and a well-meaning edit that starts treating 403 or 503
 * as dead would hide working mirrors with nothing to catch it.
 */
export function classifyStatus(status: number): LinkAvailability {
  if (status >= 200 && status < 400) return 'ONLINE';
  if (status === 404 || status === 410) return 'OFFLINE';
  // Everything else: the host answered, but not with the file. Not proof of death.
  return 'DEGRADED';
}

function classify(status: number): ProbeResult {
  const availability = classifyStatus(status);
  return {
    availability,
    status,
    reason: availability === 'OFFLINE' ? `HTTP ${status} — a fájl nincs meg` : `HTTP ${status}`,
  };
}

function probeOnce(target: URL, method: 'HEAD' | 'GET'): Promise<number> {
  return new Promise((resolve, reject) => {
    const send = target.protocol === 'http:' ? httpRequest : httpsRequest;

    const req = send(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (target.protocol === 'http:' ? 80 : 443),
        path: `${target.pathname}${target.search}`,
        method,
        lookup: guardedLookup,
        timeout: TIMEOUT_MS,
        headers: {
          'user-agent': USER_AGENT,
          accept: '*/*',
          // One byte is enough to know the file is there.
          ...(method === 'GET' ? { range: 'bytes=0-0' } : {}),
        },
      },
      (response) => {
        // The body is never needed; draining it releases the socket.
        response.resume();
        resolve(response.statusCode ?? 0);
      },
    );

    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('időtúllépés')));
    req.end();
  });
}

async function probe(url: string): Promise<ProbeResult> {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return { availability: 'OFFLINE', status: null, reason: 'értelmezhetetlen URL' };
  }

  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    return { availability: 'OFFLINE', status: null, reason: `nem támogatott séma: ${target.protocol}` };
  }

  try {
    // An address literal never reaches the resolver, so it is checked up front.
    assertPublicHost(target.hostname);

    const head = await probeOnce(target, 'HEAD');

    // 405/501: the host does not do HEAD. 400/403 on HEAD is also common from
    // CDNs that only sign GET requests — worth one retry before believing it.
    if (head === 405 || head === 501 || head === 400 || head === 403) {
      const get = await probeOnce(target, 'GET');
      return classify(get);
    }

    return classify(head);
  } catch (error) {
    if (error instanceof BlockedAddressError) {
      // Not a dead mirror — a link that should never have been saved.
      logger.warn('A letöltési link belső címre mutat', { url, address: error.address });
      return { availability: 'OFFLINE', status: null, reason: 'belső cím' };
    }

    return {
      availability: 'DEGRADED',
      status: null,
      reason: error instanceof Error ? error.message : 'ismeretlen hiba',
    };
  }
}

export interface LinkCheckOutcome {
  checked: number;
  online: number;
  degraded: number;
  offline: number;
  /** Links that changed state — the only ones worth a log line. */
  changed: Array<{ id: string; url: string; from: LinkAvailability; to: LinkAvailability; reason: string }>;
}

/**
 * Checks the least recently verified links.
 *
 * Ordered by `lastCheckedAt` ascending with nulls first, so a fresh install
 * works through its backlog and a steady state re-checks everything in rotation.
 * The batch size is what keeps a catalogue of any size inside one nightly run.
 */
export async function checkDownloadLinks(batchSize = DEFAULT_BATCH): Promise<LinkCheckOutcome> {
  const links = await db.downloadLink.findMany({
    where: { release: { deletedAt: null, status: 'PUBLISHED' } },
    select: { id: true, url: true, availability: true },
    orderBy: { lastCheckedAt: { sort: 'asc', nulls: 'first' } },
    take: batchSize,
  });

  const outcome: LinkCheckOutcome = { checked: 0, online: 0, degraded: 0, offline: 0, changed: [] };
  const lastHitAt = new Map<string, number>();

  for (const link of links) {
    // One host often serves many mirrors; hitting it sixty times in a second is
    // how a checker gets the whole site rate-limited.
    const host = ((): string => {
      try {
        return new URL(link.url).hostname;
      } catch {
        return '';
      }
    })();

    const previous = lastHitAt.get(host);
    if (previous !== undefined) {
      const wait = HOST_GAP_MS - (Date.now() - previous);
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    }

    const result = await probe(link.url);
    lastHitAt.set(host, Date.now());

    await db.downloadLink.update({
      where: { id: link.id },
      data: { availability: result.availability, lastCheckedAt: new Date() },
    });

    outcome.checked += 1;
    if (result.availability === 'ONLINE') outcome.online += 1;
    else if (result.availability === 'DEGRADED') outcome.degraded += 1;
    else outcome.offline += 1;

    if (result.availability !== link.availability) {
      outcome.changed.push({
        id: link.id,
        url: link.url,
        from: link.availability,
        to: result.availability,
        reason: result.reason,
      });
    }
  }

  if (outcome.changed.length > 0) {
    logger.info('Letöltési linkek állapota változott', { changed: outcome.changed });
  }

  return outcome;
}
