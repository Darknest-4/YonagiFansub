import { NextResponse, type NextRequest } from 'next/server';
import { gatePlayback, playbackHeaders } from '@/lib/video/gate';
import {
  createPlaybackToken,
  MANIFEST_TTL_SECONDS,
  SEGMENT_TTL_SECONDS,
  verifyPlaybackToken,
} from '@/lib/video/token';
import { mediaDriver } from '@/lib/media/driver';
import { dirOf, rewritePlaylist } from '@/lib/video/playlist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Serves a playlist with every URI rewritten to a signed proxy URL.
 *
 * Handles both levels of an HLS package. The master playlist is addressed with
 * `res=''` and its variant lines are rewritten to point back here; a variant
 * playlist is addressed by its own key and its segment lines are rewritten to
 * the segment endpoint. One handler for both, because the rewriting is identical
 * and only the token scope differs.
 *
 * Tokens are minted fresh on every response. hls.js re-fetches a live playlist
 * as it plays, so a running session continuously renews itself while a scraped
 * copy stops working within ninety seconds.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> },
): Promise<NextResponse> {
  const { videoId } = await params;
  const gate = await gatePlayback(request, videoId);

  if (!gate.ok) {
    return new NextResponse(gate.reason, { status: gate.status, headers: playbackHeaders('text/plain') });
  }

  const token = request.nextUrl.searchParams.get('t') ?? '';
  const requested = request.nextUrl.searchParams.get('r') ?? '';

  const verified = verifyPlaybackToken(token, {
    scope: requested ? 'segment' : 'manifest',
    sid: gate.video.id,
    res: requested,
    viewerBinding: gate.binding,
  });

  if (!verified.ok) {
    // The reason is deliberately not echoed: "expired" versus "wrong viewer" is
    // information for whoever is probing, and the player only ever needs to know
    // that it should ask for a new manifest.
    return new NextResponse('A lejátszási jogosultság lejárt.', {
      status: 403,
      headers: playbackHeaders('text/plain'),
    });
  }

  // The manifest token addresses the package; a variant token names its own key.
  const key = requested || gate.video.masterKey;
  const stored = await mediaDriver().get(key);

  if (!stored) {
    return new NextResponse('A lejátszási lista nem található.', {
      status: 404,
      headers: playbackHeaders('text/plain'),
    });
  }

  const source =
    stored.body instanceof Uint8Array
      ? Buffer.from(stored.body).toString('utf8')
      : await new Response(stored.body).text();

  const rewritten = rewritePlaylist(source, {
    baseDir: dirOf(key),
    resolve: (resourceKey, kind) => {
      // A nested playlist comes back here; segments and keys go to the segment
      // endpoint. Both are signed for this viewer and this exact resource.
      if (kind === 'playlist') {
        const child = createPlaybackToken(
          { scope: 'segment', sid: gate.video.id, res: resourceKey, vb: gate.binding },
          MANIFEST_TTL_SECONDS,
        );
        return `/api/v1/watch/${videoId}/playlist?r=${encodeURIComponent(resourceKey)}&t=${encodeURIComponent(child)}`;
      }

      const child = createPlaybackToken(
        { scope: kind === 'key' ? 'key' : 'segment', sid: gate.video.id, res: resourceKey, vb: gate.binding },
        SEGMENT_TTL_SECONDS,
      );
      return `/api/v1/watch/${videoId}/segment?r=${encodeURIComponent(resourceKey)}&t=${encodeURIComponent(child)}${kind === 'key' ? '&k=1' : ''}`;
    },
  });

  return new NextResponse(rewritten, {
    status: 200,
    headers: playbackHeaders('application/vnd.apple.mpegurl'),
  });
}
