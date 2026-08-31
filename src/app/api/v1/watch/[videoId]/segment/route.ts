import { NextResponse, type NextRequest } from 'next/server';
import { gatePlayback, playbackHeaders } from '@/lib/video/gate';
import { verifyPlaybackToken } from '@/lib/video/token';
import { contentTypeFor, mediaDriver } from '@/lib/media/driver';

import { checkRateLimit } from '@/lib/api/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Serves one media segment (or a decryption key) through the authorising proxy.
 *
 * Every request is independently verified: signature, expiry, scope, viewer and
 * the exact resource. A token minted for segment 3 cannot fetch segment 4, so
 * "download the episode" means replaying the playlist for every segment inside
 * a ninety-second window rather than following one predictable URL pattern.
 *
 * Rate limited per viewer. Playback pulls segments at roughly the rate the video
 * plays; a scraper pulls them as fast as the network allows, and the limit is
 * set where those two behaviours separate.
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

  const token = request.nextUrl.searchParams.get('t') ?? '';
  const resource = request.nextUrl.searchParams.get('r') ?? '';
  const isKey = request.nextUrl.searchParams.get('k') === '1';

  const verified = verifyPlaybackToken(token, {
    scope: isKey ? 'key' : 'segment',
    sid: gate.video.id,
    res: resource,
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
  const limit = await checkRateLimit(
    'video:segment',
    `${gate.binding}:${gate.video.id}`,
  );
  if (!limit.allowed) {
    return new NextResponse(null, {
      status: 429,
      headers: playbackHeaders(null),
    });
  }

  const range = request.headers.get('range');
  const stored = await mediaDriver().get(resource, range);

  if (!stored) {
    return new NextResponse(null, { status: 404, headers: playbackHeaders(null) });
  }

  const headers = playbackHeaders(stored.contentType ?? contentTypeFor(resource));
  if (stored.contentLength !== null) headers.set('Content-Length', String(stored.contentLength));
  if (stored.contentRange) headers.set('Content-Range', stored.contentRange);
  headers.set('Accept-Ranges', 'bytes');

  const body =
    stored.body instanceof Uint8Array ? Buffer.from(stored.body) : stored.body;

  return new NextResponse(body as BodyInit, { status: stored.status, headers });
}
