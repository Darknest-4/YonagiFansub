import 'server-only';
import { BadRequestError } from '@/lib/errors';
import { buildEmbedUrl, isAllowedUrl } from '@/lib/video/provider';
import {
  createPlaybackToken,
  MANIFEST_TTL_SECONDS,
  SEGMENT_TTL_SECONDS,
} from '@/lib/video/token';
import type { PlayableVideo } from '@/server/video';

/**
 * Deciding how one source is played.
 *
 * Three kinds and a proxy flag give four routes, and the choice has to be made
 * in one place: the manifest endpoint, the isolated frame and the player all
 * need the same answer, and three implementations of "is this proxied" would
 * drift within a month.
 *
 * The rule underneath is simple. **Anything we serve, we protect; anything we
 * do not serve, we isolate.** A proxied source goes through the signing scheme
 * and reaches the player as a token. A non-proxied one is somebody else's URL,
 * so it is never handed to the main page — it is confined to a throwaway
 * same-origin frame that carries a policy naming exactly that one host, and
 * nothing else on the site is widened to accommodate it.
 */

export type PlaybackMode =
  /** Our HLS proxy: hls.js against a signed playlist, no URL anywhere. */
  | 'hls-proxy'
  /** A remote file streamed through us, still behind a token. */
  | 'file-proxy'
  /** Anything we do not serve: isolated in its own frame. */
  | 'isolated';

export interface PlaybackPlan {
  mode: PlaybackMode;
  /** What the player loads. Always same-origin. */
  url: string;
  expiresIn: number;
  title: string;
  durationSec: number | null;
  /** Only meaningful for `isolated`; the frame handles its own sandboxing. */
  allowPopups: boolean;
}

/**
 * Resolves the external URL a source ultimately points at.
 *
 * Exported because the frame and the proxy both need it, and both must agree —
 * a frame whose policy allows host A while the proxy fetches host B is a bug
 * that only shows up as a blank player.
 */
export function resolveExternalUrl(video: PlayableVideo): string {
  if (video.kind === 'EMBED') {
    if (!video.provider) {
      throw new BadRequestError('A beágyazott forráshoz nincs szolgáltató rendelve.');
    }
    if (!video.externalId) {
      throw new BadRequestError('A beágyazott forráshoz nincs azonosító megadva.');
    }

    const url = buildEmbedUrl(video.provider, video.externalId);
    if (!url) {
      throw new BadRequestError('A szolgáltatóhoz nincs beágyazási sablon megadva.');
    }

    // The template is admin-editable, so its output is checked rather than
    // trusted: a typo must not become a frame pointed at an arbitrary host.
    if (!isAllowedUrl(video.provider, url)) {
      throw new BadRequestError(
        'A beágyazási cím nem a szolgáltatóhoz bejegyzett domainre mutat.',
      );
    }

    return url;
  }

  if (!video.sourceUrl) {
    throw new BadRequestError('A forráshoz nincs URL megadva.');
  }

  // A direct file may have no provider at all — an own VPS is the common case —
  // in which case the URL itself is the declaration and only https is required.
  if (video.provider && video.provider.domains.length > 0) {
    if (!isAllowedUrl(video.provider, video.sourceUrl)) {
      throw new BadRequestError('A fájl URL-je nem a szolgáltató domainjére mutat.');
    }
  } else if (!video.sourceUrl.startsWith('https://')) {
    throw new BadRequestError('Csak https URL adható meg.');
  }

  return video.sourceUrl;
}

/** True when this source's bytes travel through us. */
export function isProxied(video: PlayableVideo): boolean {
  return video.kind === 'HLS_PROXY' || (video.kind === 'DIRECT_FILE' && video.proxied);
}

export function buildPlaybackPlan(video: PlayableVideo, binding: string): PlaybackPlan {
  const title = `${video.projectTitle} — ${video.episodeNumber}. rész`;

  if (video.kind === 'HLS_PROXY') {
    const token = createPlaybackToken(
      { scope: 'manifest', sid: video.id, res: '', vb: binding },
      MANIFEST_TTL_SECONDS,
    );

    return {
      mode: 'hls-proxy',
      url: `/api/v1/watch/${video.id}/playlist?t=${encodeURIComponent(token)}`,
      expiresIn: MANIFEST_TTL_SECONDS,
      title,
      durationSec: video.durationSec,
      allowPopups: false,
    };
  }

  if (video.kind === 'DIRECT_FILE' && video.proxied) {
    // The resolution runs here too, so a broken URL is a 400 at "press play"
    // rather than a stalled request once the player is already open.
    resolveExternalUrl(video);

    const token = createPlaybackToken(
      { scope: 'segment', sid: video.id, res: 'file', vb: binding },
      SEGMENT_TTL_SECONDS,
    );

    return {
      mode: 'file-proxy',
      url: `/api/v1/watch/${video.id}/file?t=${encodeURIComponent(token)}`,
      expiresIn: SEGMENT_TTL_SECONDS,
      title,
      durationSec: video.durationSec,
      allowPopups: false,
    };
  }

  /*
    Isolated. The token is still required and still viewer-bound — it does not
    hide the provider's URL, which is theirs to publish, but it does stop the
    frame from being opened outside our pages or shared as a working link.
  */
  const token = createPlaybackToken(
    { scope: 'manifest', sid: video.id, res: 'frame', vb: binding },
    MANIFEST_TTL_SECONDS,
  );

  return {
    mode: 'isolated',
    url: `/beagyazas/${video.id}?t=${encodeURIComponent(token)}`,
    expiresIn: MANIFEST_TTL_SECONDS,
    title,
    durationSec: video.durationSec,
    allowPopups: video.allowPopups,
  };
}
