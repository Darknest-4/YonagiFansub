import { NextResponse, type NextRequest } from 'next/server';
import { gatePlayback, playbackHeaders } from '@/lib/video/gate';
import { verifyPlaybackToken } from '@/lib/video/token';
import { resolveExternalUrl } from '@/lib/video/plan';
import { enforceRateLimit } from '@/lib/api/rate-limit';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Streams a remote file through the signing proxy.
 *
 * This is the "hide the origin" half of the per-source proxy switch: the viewer
 * sees a token URL on our domain, and the host it actually comes from never
 * reaches the browser. Every byte crosses our bandwidth, which is exactly why
 * it is a per-source decision rather than the default.
 *
 * The `Range` header is passed straight through and the upstream's answer is
 * relayed unchanged. Seeking in a two-gigabyte file is the whole reason range
 * requests exist, and a proxy that swallowed them would turn every seek into a
 * full re-download.
 *
 * The body is piped, never buffered. Reading a film into memory before
 * answering would put the entire file through the heap for no benefit, since
 * the client consumes it in order anyway.
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

  const limit = await enforceRateLimit('video:segment', `${gate.binding}:${gate.video.id}`);
  if (!limit.allowed) {
    return new NextResponse(null, { status: 429, headers: playbackHeaders(null) });
  }

  // The URL comes from the database and is re-validated against the provider's
  // declared domains on every request — a source edited to point somewhere else
  // must not turn this into an open forward proxy.
  let target: string;
  try {
    target = resolveExternalUrl(gate.video);
  } catch {
    return new NextResponse(null, { status: 409, headers: playbackHeaders(null) });
  }

  const range = request.headers.get('range');

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers: {
        ...(range ? { range } : {}),
        // Some filehosts refuse a request with no referer, and others refuse one
        // pointing at a different site. Sending the file's own origin is what a
        // browser opening the page would do.
        referer: new URL(target).origin,
        'user-agent': 'Mozilla/5.0 (compatible; YonagiFansub/1.0)',
      },
      // No redirect following: a redirect could leave the domains the source was
      // validated against, and this proxy would follow it without noticing.
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    logger.warn('A külső videóforrás nem érhető el', { videoId, error: String(error) });
    return new NextResponse(null, { status: 502, headers: playbackHeaders(null) });
  }

  if (upstream.status >= 300 && upstream.status < 400) {
    logger.warn('A külső videóforrás átirányítást küldött', {
      videoId,
      location: upstream.headers.get('location'),
    });
    return new NextResponse(null, { status: 502, headers: playbackHeaders(null) });
  }

  if (!upstream.ok && upstream.status !== 206) {
    return new NextResponse(null, { status: upstream.status === 404 ? 404 : 502, headers: playbackHeaders(null) });
  }

  const headers = playbackHeaders(upstream.headers.get('content-type') ?? 'video/mp4');
  for (const header of ['content-length', 'content-range', 'accept-ranges'] as const) {
    const value = upstream.headers.get(header);
    if (value) headers.set(header, value);
  }
  if (!headers.has('accept-ranges')) headers.set('Accept-Ranges', 'bytes');

  return new NextResponse(upstream.body, {
    status: upstream.status === 206 ? 206 : 200,
    headers,
  });
}
