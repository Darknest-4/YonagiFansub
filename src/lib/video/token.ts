import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';

/**
 * Playback tokens.
 *
 * ## What this can and cannot do
 *
 * It cannot make a stream undownloadable. If a browser decodes and displays the
 * video, the bytes reached the machine, and anything that reached the machine
 * can be kept. Only a DRM system (Widevine, PlayReady, FairPlay) changes that,
 * and only by moving decryption into a black box the page cannot read — which
 * needs a licence server and per-title packaging.
 *
 * What it does do is remove every cheap way to take the file:
 *
 *   • **There is no file URL.** The page holds a blob URL; the playlist is
 *     generated per request and names only our own proxy endpoints.
 *   • **Every URL expires.** A token is valid for a minute or two, so a link
 *     copied out of the network tab is dead before it can be pasted anywhere.
 *   • **Every URL is bound to one viewer.** The signature covers the session and
 *     the client fingerprint, so a token lifted from one browser does not work
 *     in another, and a shared link does not work at all.
 *   • **Segments are individually signed.** Grabbing "the video" means grabbing
 *     hundreds of separately authorised objects within the expiry window.
 *
 * A determined person with developer tools will still get the file. That is a
 * property of the web, not a gap in this code, and it is worth stating plainly
 * rather than implying a guarantee that does not exist.
 *
 * ## Format
 *
 * `v1.<payload-b64url>.<signature-b64url>` — the payload is readable on
 * purpose. It carries no secret, and a token whose contents can be inspected is
 * far easier to debug than an opaque blob. The signature is what matters.
 */

const VERSION = 'v1';

/** Master playlist. Long enough to survive a slow page load, short enough to be useless later. */
export const MANIFEST_TTL_SECONDS = 120;

/**
 * Segments and keys.
 *
 * Deliberately shorter than the manifest: hls.js re-requests the media playlist
 * as it plays, so a live session keeps getting fresh tokens, while a scraped one
 * stops working almost immediately.
 */
export const SEGMENT_TTL_SECONDS = 90;

export type TokenScope = 'manifest' | 'segment' | 'key';

export interface PlaybackClaims {
  /** Scope this token authorises — a segment token must not fetch a key. */
  scope: TokenScope;
  /** Video source id. */
  sid: string;
  /**
   * Resource within the package, relative to the master playlist's directory.
   * Empty for the manifest scope, which addresses the package itself.
   */
  res: string;
  /** Viewer binding: hash of session id (or anonymous id) plus client hints. */
  vb: string;
  /** Expiry, epoch seconds. */
  exp: number;
}

function base64url(input: Buffer): string {
  return input.toString('base64url');
}

/**
 * Signing key, derived from `AUTH_SECRET` rather than being a separate secret.
 *
 * A derived key means one secret to configure and rotate, and the domain
 * separation string keeps a playback token from ever being valid as a session
 * token even though both come from the same root.
 */
function signingKey(): Buffer {
  return createHmac('sha256', env.AUTH_SECRET).update('yonagi:video:v1').digest();
}

function sign(payload: string): string {
  return base64url(createHmac('sha256', signingKey()).update(payload).digest());
}

/**
 * Viewer binding.
 *
 * Session id when there is one, otherwise a per-request anonymous identifier,
 * mixed with a coarse client fingerprint. The IP is included as a hash and only
 * as its network prefix: binding to a full address breaks mobile viewers whose
 * address changes mid-episode, which would look like the player randomly failing.
 */
export function viewerBinding(input: {
  sessionId?: string | null;
  anonymousId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}): string {
  const identity = input.sessionId ?? input.anonymousId ?? 'anon';

  // /24 for IPv4, /48 for IPv6 — stable across a session, useless as a locator.
  const ip = input.ip ?? '';
  const prefix = ip.includes(':')
    ? ip.split(':').slice(0, 3).join(':')
    : ip.split('.').slice(0, 3).join('.');

  return createHmac('sha256', signingKey())
    .update(`${identity}|${prefix}|${input.userAgent ?? ''}`)
    .digest('base64url')
    .slice(0, 24);
}

export function createPlaybackToken(claims: Omit<PlaybackClaims, 'exp'>, ttlSeconds: number): string {
  const payload: PlaybackClaims = {
    ...claims,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };

  const encoded = base64url(Buffer.from(JSON.stringify(payload)));
  return `${VERSION}.${encoded}.${sign(encoded)}`;
}

export type VerifyFailure =
  | 'malformed'
  | 'bad-signature'
  | 'expired'
  | 'wrong-scope'
  | 'wrong-viewer'
  | 'wrong-resource';

export type VerifyResult =
  | { ok: true; claims: PlaybackClaims }
  | { ok: false; reason: VerifyFailure };

/**
 * Verifies a token against what the request is actually asking for.
 *
 * The expected scope, resource and viewer are parameters rather than something
 * the caller checks afterwards: a signature check that passes while the claims
 * go unread is the classic way this kind of token ends up granting everything
 * to anyone holding any valid token.
 */
export function verifyPlaybackToken(
  token: string,
  expected: { scope: TokenScope; sid: string; res?: string; viewerBinding: string },
): VerifyResult {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== VERSION) return { ok: false, reason: 'malformed' };

  const [, encoded, signature] = parts as [string, string, string];

  const expectedSignature = sign(encoded);
  const provided = Buffer.from(signature);
  const computed = Buffer.from(expectedSignature);

  // Constant-time, and length-checked first because timingSafeEqual throws on a
  // length mismatch — which would itself be a timing signal.
  if (provided.length !== computed.length || !timingSafeEqual(provided, computed)) {
    return { ok: false, reason: 'bad-signature' };
  }

  let claims: PlaybackClaims;
  try {
    claims = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as PlaybackClaims;
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now()) {
    return { ok: false, reason: 'expired' };
  }
  if (claims.scope !== expected.scope) return { ok: false, reason: 'wrong-scope' };
  if (claims.sid !== expected.sid) return { ok: false, reason: 'wrong-resource' };
  if (expected.res !== undefined && claims.res !== expected.res) {
    return { ok: false, reason: 'wrong-resource' };
  }
  if (claims.vb !== expected.viewerBinding) return { ok: false, reason: 'wrong-viewer' };

  return { ok: true, claims };
}
