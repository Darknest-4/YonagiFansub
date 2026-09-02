import { NextResponse, type NextRequest } from 'next/server';
import { gatePlayback, playbackHeaders } from '@/features/video/gate';
import { buildPlaybackPlan } from '@/features/video/plan';
import { checkRateLimit } from '@/shared/api/rate-limit';
import { recordView } from '@/features/video/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Opens a playback session.
 *
 * Returns the URL of the master playlist with a fresh token, rather than the
 * playlist itself. That split is what lets the player treat everything below as
 * opaque: it receives one URL, hands it to hls.js, and never constructs a media
 * URL of its own — so there is no place in the client code where a storage path
 * could be assembled or leaked.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> },
): Promise<NextResponse> {
  const { videoId } = await params;
  const gate = await gatePlayback(request, videoId);

  if (!gate.ok) {
    return NextResponse.json(
      { error: { code: 'PLAYBACK_DENIED', message: gate.reason } },
      { status: gate.status, headers: playbackHeaders('application/json') },
    );
  }

  /*
    Rate limited, and not only to protect the endpoint.

    This is where `recordView` fires, so without a limit the view counter is a
    number anyone can set by holding down refresh — a statistic nobody could
    trust, which is worse than not having one. Thirty a minute is far above what
    opening an episode and switching sources costs, and far below what inflating
    a count needs.
  */
  /*
    `checkRateLimit`, not `enforceRateLimit`: the latter throws a RateLimitError,
    which `defineRoute` maps to a 429 — but these playback routes are raw
    handlers with no such mapping, so a throw escaped as a 500. The caller could
    not tell "slow down" from "the server broke", and neither could a log reader.
  */
  const limit = await checkRateLimit('video:manifest', `${gate.binding}:${gate.video.id}`);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: 'Túl sok kérés. Várj egy kicsit.' } },
      { status: 429, headers: playbackHeaders('application/json') },
    );
  }

  // Resolution can fail on a misconfigured source (no template, wrong domain);
  // that is a 400 with a readable reason, not a 500.
  const plan = buildPlaybackPlan(gate.video, gate.binding);

  await recordView(gate.video.id);

  return NextResponse.json({ data: plan }, { headers: playbackHeaders('application/json') });
}
