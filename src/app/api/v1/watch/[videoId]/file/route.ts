import { NextResponse, type NextRequest } from 'next/server';
import { request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';
import { gatePlayback, playbackHeaders } from '@/lib/video/gate';
import { verifyPlaybackToken } from '@/lib/video/token';
import { resolveExternalUrl } from '@/lib/video/plan';
import { assertPublicHost, BlockedAddressError, guardedLookup } from '@/lib/video/ssrf';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Streams a remote file through the signing proxy.
 *
 * This is the "hide the origin" half of the per-source proxy switch: the viewer
 * sees a token URL on our domain, and the host it actually comes from never
 * reaches the browser. Every byte crosses our bandwidth, which is exactly why it
 * is a per-source decision rather than the default.
 *
 * ## Why `https.request` and not `fetch`
 *
 * Because this endpoint fetches a URL somebody typed, it is an SSRF primitive
 * unless the destination is constrained — and constraining it properly means
 * inspecting the address the socket is about to connect to, not the hostname in
 * the URL. `fetch` gives no hook for that; `https.request` takes a `lookup`, so
 * every resolved address is checked and a private one is refused before the
 * connection opens. Validating the hostname up front and then calling `fetch`
 * would leave the gap where DNS answers differently the second time.
 *
 * Redirects are not followed, for the same reason: a 302 is an invitation to
 * leave the address space we just validated.
 *
 * The body is piped, never buffered. A film is thousands of megabytes and the
 * client consumes it in order; putting it through the server's heap first buys
 * nothing.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> },
): Promise<NextResponse> {
  const { videoId } = await params;
  const gate = await gatePlayback(request, videoId);

  if (!gate.ok) {
    return new NextResponse(null, { status: gate.status, headers: playbackHeaders(null) });
  }

  const verified = verifyPlaybackToken(request.nextUrl.searchParams.get('t') ?? '', {
    scope: 'segment',
    sid: gate.video.id,
    res: 'file',
    viewerBinding: gate.binding,
  });

  if (!verified.ok) {
    return new NextResponse(null, { status: 403, headers: playbackHeaders(null) });
  }

  /*
    `checkRateLimit`, not `enforceRateLimit`: the latter throws a RateLimitError,
    which `defineRoute` maps to a 429 — but these playback routes are raw
    handlers with no such mapping, so a throw escaped as a 500. The caller could
    not tell "slow down" from "the server broke", and neither could a log reader.
  */
  const limit = await checkRateLimit('video:segment', `${gate.binding}:${gate.video.id}`);
  if (!limit.allowed) {
    return new NextResponse(null, { status: 429, headers: playbackHeaders(null) });
  }

  // Re-validated against the provider's declared domains on every request: a
  // source edited to point elsewhere must not turn this into an open proxy.
  let target: URL;
  try {
    target = new URL(resolveExternalUrl(gate.video));
  } catch {
    return new NextResponse(null, { status: 409, headers: playbackHeaders(null) });
  }

  if (target.protocol !== 'https:') {
    return new NextResponse(null, { status: 409, headers: playbackHeaders(null) });
  }

  try {
    // Literals never reach the resolver, so they are checked before the request.
    assertPublicHost(target.hostname);

    const upstream = await fetchUpstream(target, request.headers.get('range'));

    const headers = playbackHeaders(upstream.contentType ?? 'video/mp4');
    if (upstream.contentLength) headers.set('Content-Length', upstream.contentLength);
    if (upstream.contentRange) headers.set('Content-Range', upstream.contentRange);
    headers.set('Accept-Ranges', 'bytes');

    return new NextResponse(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    if (error instanceof BlockedAddressError) {
      // Worth a warning rather than a debug line: on a healthy instance this
      // only fires when somebody has pointed a source at the private network.
      logger.warn('A videóforrás belső címre mutat — a kérés elutasítva', {
        videoId,
        host: target.hostname,
        address: error.address,
      });
      return new NextResponse(null, { status: 409, headers: playbackHeaders(null) });
    }

    logger.warn('A külső videóforrás nem érhető el', { videoId, error: String(error) });
    return new NextResponse(null, { status: 502, headers: playbackHeaders(null) });
  }
}

interface UpstreamResponse {
  status: 200 | 206;
  body: ReadableStream<Uint8Array>;
  contentType: string | null;
  contentLength: string | null;
  contentRange: string | null;
}

function fetchUpstream(target: URL, range: string | null): Promise<UpstreamResponse> {
  return new Promise((resolve, reject) => {
    const upstream = httpsRequest(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || 443,
        path: `${target.pathname}${target.search}`,
        method: 'GET',
        // The whole point of this file: no socket opens to a private address.
        lookup: guardedLookup,
        timeout: 30_000,
        headers: {
          ...(range ? { range } : {}),
          // Some filehosts refuse a request with no referer, others refuse one
          // naming a different site. Sending the file's own origin is what a
          // browser opening that page would do.
          referer: target.origin,
          'user-agent': 'Mozilla/5.0 (compatible; YonagiFansub/1.0)',
          accept: '*/*',
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;

        if (status >= 300 && status < 400) {
          response.resume();
          reject(new Error(`átirányítás (${status}) — nem követjük`));
          return;
        }

        if (status !== 200 && status !== 206) {
          response.resume();
          reject(new Error(`HTTP ${status}`));
          return;
        }

        resolve({
          status,
          body: Readable.toWeb(response) as ReadableStream<Uint8Array>,
          contentType: response.headers['content-type'] ?? null,
          contentLength: response.headers['content-length'] ?? null,
          contentRange: response.headers['content-range'] ?? null,
        });
      },
    );

    upstream.on('error', reject);
    upstream.on('timeout', () => {
      upstream.destroy(new Error('időtúllépés'));
    });
    upstream.end();
  });
}
