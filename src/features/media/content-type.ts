/**
 * Content types for the objects protected playback serves.
 *
 * Kept to what an HLS package contains. Guessing broadly here would mean the
 * playback proxy could be pointed at arbitrary keys and asked to label them
 * helpfully, which is the sort of thing that turns a media route into a file
 * server.
 *
 * This list lives in its own module, free of `server-only` and of `@/` imports,
 * because two things have to agree on it: the proxy that serves a package, and
 * `scripts/hls-package.ts`, which uploads one. A packager that labels a segment
 * differently from how the proxy labels it produces a package that plays on the
 * encoder's machine and not in a browser — so they read the same table rather
 * than each keeping their own copy in step by hand.
 */

const VIDEO_CONTENT_TYPES: Record<string, string> = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
  '.m4s': 'video/iso.segment',
  '.mp4': 'video/mp4',
  '.vtt': 'text/vtt',
  '.key': 'application/octet-stream',
};

export function contentTypeFor(key: string): string | null {
  const dot = key.lastIndexOf('.');
  if (dot < 0) return null;
  return VIDEO_CONTENT_TYPES[key.slice(dot).toLowerCase()] ?? null;
}

/** Extensions an HLS package may contain. Anything else is not ours to upload. */
export const PACKAGE_EXTENSIONS = Object.keys(VIDEO_CONTENT_TYPES);
