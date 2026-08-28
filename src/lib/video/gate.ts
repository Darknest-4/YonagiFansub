import 'server-only';
import type { NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { clientIp } from '@/lib/auth/tokens';
import { getSession } from '@/lib/auth/session';
import { getPlayableVideo, type PlayableVideo } from '@/server/video';
import { viewerBinding } from '@/lib/video/token';

/**
 * The checks every playback request runs, in one place.
 *
 * Playback has four endpoints (manifest, media playlist, segment, key) and all
 * four need the same answer to "is this our page, is this our viewer, and is
 * this video still published". Duplicating that four times is how one of them
 * ends up missing a check after a refactor.
 */

export interface GateSuccess {
  ok: true;
  video: PlayableVideo;
  binding: string;
}

export interface GateFailure {
  ok: false;
  status: 401 | 403 | 404;
  reason: string;
}

/**
 * Rejects requests that did not come from our own pages.
 *
 * `Sec-Fetch-Site` is set by the browser and cannot be forged by page script,
 * which makes it worth more than `Referer` (strippable by policy, and absent on
 * plenty of legitimate requests). A hotlinked `<video>` on another site, or a
 * URL pasted into the address bar, both fail this — which is the point.
 *
 * Requests without the header at all are allowed: non-browser clients that a
 * fansub might legitimately use (a cast device, an older embedded player) do not
 * send it, and blocking them would trade a real capability for no security —
 * the signed token is what actually authorises the request.
 */
function sameOriginish(request: NextRequest): boolean {
  const site = request.headers.get('sec-fetch-site');
  if (site === null) return true;
  return site === 'same-origin' || site === 'same-site' || site === 'none';
}

export async function gatePlayback(
  request: NextRequest,
  videoId: string,
): Promise<GateSuccess | GateFailure> {
  if (!sameOriginish(request)) {
    return { ok: false, status: 403, reason: 'Csak a Yonagi Fansub oldaláról játszható le.' };
  }

  // Re-read on every request: a video unpublished a minute ago must stop
  // playing, and a token issued before that must not keep working.
  const video = await getPlayableVideo(videoId);
  if (!video) return { ok: false, status: 404, reason: 'A videó nem található.' };

  const session = await getSession();

  if (video.requiresAuth && !session) {
    return { ok: false, status: 401, reason: 'A lejátszáshoz be kell jelentkezned.' };
  }

  return {
    ok: true,
    video,
    binding: viewerBinding({
      sessionId: session?.sessionId ?? null,
      // Anonymous viewers are bound to the cookie the middleware already issues
      // for CSRF; it is per-browser and survives a reload, which is exactly the
      // lifetime a playback session needs.
      anonymousId: request.cookies.get(anonymousCookieName())?.value ?? null,
      ip: clientIp(request.headers),
      userAgent: request.headers.get('user-agent'),
    }),
  };
}

/** The CSRF cookie doubles as the anonymous viewer id; both are per-browser. */
export function anonymousCookieName(): string {
  return env.NODE_ENV === 'production' ? '__Host-yonagi_csrf' : 'yonagi_csrf';
}

/**
 * Headers every playback response carries.
 *
 * `no-store` because each URL is single-viewer and short-lived, so a shared
 * cache holding one would both leak it and serve it after expiry. The rest
 * closes the obvious extraction paths: no cross-origin reads, no framing, and no
 * `Content-Type` sniffing that could turn a segment into something a browser
 * will render.
 */
export function playbackHeaders(contentType: string | null): Headers {
  return new Headers({
    ...(contentType ? { 'Content-Type': contentType } : {}),
    'Cache-Control': 'no-store, no-transform, private',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    // A download hint, not a barrier: it stops a stray navigation from being
    // treated as a file save, and costs nothing.
    'Content-Disposition': 'inline',
  });
}
