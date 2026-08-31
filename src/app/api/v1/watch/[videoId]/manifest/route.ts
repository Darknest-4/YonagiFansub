import { NextResponse, type NextRequest } from 'next/server';
import { gatePlayback, playbackHeaders } from '@/lib/video/gate';
import { buildPlaybackPlan } from '@/lib/video/plan';
import { recordView } from '@/server/video';

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

  // Resolution can fail on a misconfigured source (no template, wrong domain);
  // that is a 400 with a readable reason, not a 500.
  const plan = buildPlaybackPlan(gate.video, gate.binding);

  await recordView(gate.video.id);

  return NextResponse.json({ data: plan }, { headers: playbackHeaders('application/json') });
}
