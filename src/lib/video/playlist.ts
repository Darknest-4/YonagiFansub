import 'server-only';

/**
 * HLS playlist rewriting.
 *
 * A playlist is a text file whose non-comment lines are URIs, plus a handful of
 * tags that carry a `URI="…"` attribute. Rewriting means replacing every one of
 * those with a signed URL pointing at our own proxy, so the playlist the browser
 * receives never names a storage object.
 *
 * This is a **rewriter, not a parser**: it does not try to understand HLS, only
 * to find every place a URI can appear and substitute it. That is the right
 * amount of work here — the format grows tags constantly, and a parser would
 * silently drop the ones it did not know, corrupting playlists we were only
 * meant to pass through.
 */

/** Tags whose `URI` attribute has to be rewritten alongside plain URI lines. */
const URI_ATTRIBUTE_TAGS = [
  '#EXT-X-KEY',
  '#EXT-X-MAP',
  '#EXT-X-MEDIA',
  '#EXT-X-I-FRAME-STREAM-INF',
  '#EXT-X-SESSION-KEY',
  '#EXT-X-PART',
  '#EXT-X-PRELOAD-HINT',
  '#EXT-X-RENDITION-REPORT',
];

export interface RewriteOptions {
  /**
   * Builds the replacement URL for one relative resource.
   *
   * Returning `null` leaves the original in place — used for absolute URLs to
   * third parties, which are not ours to proxy.
   */
  resolve: (relativeUri: string, kind: 'segment' | 'playlist' | 'key') => string | null;
  /** Directory of the playlist being rewritten, relative to the package root. */
  baseDir: string;
}

/** Absolute URLs and protocol-relative ones are somebody else's problem. */
function isAbsolute(uri: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(uri) || uri.startsWith('//');
}

/**
 * Joins a playlist-relative URI onto the playlist's directory and normalises it.
 *
 * `..` segments are resolved here and the result is rejected if it escapes the
 * package root. A playlist is content we serve but did not necessarily author,
 * and `../../../etc/passwd` in a URI line must not become a readable key.
 */
export function resolveWithin(baseDir: string, uri: string): string | null {
  const parts = `${baseDir ? `${baseDir}/` : ''}${uri}`.split('/');
  const stack: string[] = [];

  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (stack.length === 0) return null; // escapes the root
      stack.pop();
      continue;
    }
    stack.push(part);
  }

  return stack.length > 0 ? stack.join('/') : null;
}

function classify(uri: string): 'segment' | 'playlist' | 'key' {
  const clean = uri.split('?')[0] ?? uri;
  if (clean.endsWith('.m3u8')) return 'playlist';
  if (clean.endsWith('.key')) return 'key';
  return 'segment';
}

export function rewritePlaylist(source: string, options: RewriteOptions): string {
  const { resolve, baseDir } = options;

  return source
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed === '') return line;

      if (trimmed.startsWith('#')) {
        const tag = trimmed.split(':')[0] ?? '';
        if (!URI_ATTRIBUTE_TAGS.includes(tag)) return line;

        // `URI="…"` inside an attribute list. The quotes are mandatory in the
        // spec, which is what makes this safe to do with a regex.
        return line.replace(/URI="([^"]*)"/g, (whole, uri: string) => {
          if (!uri || isAbsolute(uri)) return whole;
          const key = resolveWithin(baseDir, uri);
          if (!key) return whole;
          const replacement = resolve(key, tag === '#EXT-X-KEY' || tag === '#EXT-X-SESSION-KEY' ? 'key' : classify(uri));
          return replacement ? `URI="${replacement}"` : whole;
        });
      }

      // A bare line is a URI.
      if (isAbsolute(trimmed)) return line;
      const key = resolveWithin(baseDir, trimmed);
      if (!key) return line;

      return resolve(key, classify(trimmed)) ?? line;
    })
    .join('\n');
}

/** Directory part of a storage key, `''` for a key at the root. */
export function dirOf(key: string): string {
  const slash = key.lastIndexOf('/');
  return slash < 0 ? '' : key.slice(0, slash);
}
