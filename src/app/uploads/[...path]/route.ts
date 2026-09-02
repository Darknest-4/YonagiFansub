import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { env } from '@/infrastructure/env';
import { localMediaRoot } from '@/infrastructure/storage/driver';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Serves the local media driver's files.
 *
 * `public/` cannot do this job: Next resolves that directory into a static
 * manifest at build time, so a file uploaded afterwards exists on disk and still
 * answers 404 — the failure the media library hit the first time it stored
 * something. Reading the directory per request is what makes an upload visible
 * the moment it lands, and what lets a mounted volume survive a redeploy.
 *
 * With `MEDIA_DRIVER=s3` this route is dead weight and says so with a 404: the
 * bucket or the CDN in front of it serves those URLs, and quietly answering from
 * local disk instead would hide a misconfiguration.
 */

/**
 * Extensions this route will serve — images only, deliberately.
 *
 * **Do not add video types here.** HLS packages live under the same storage root
 * and are served exclusively through `/api/v1/watch/…`, which checks a signed,
 * viewer-bound, expiring token per request. Adding `.ts`, `.m3u8` or `.m4s` to
 * this map would publish every segment at a stable, unauthenticated URL and
 * silently undo that protection — the video would still play, so nothing would
 * look broken.
 */
const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  if (env.MEDIA_DRIVER !== 'local') return new NextResponse(null, { status: 404 });

  const { path: segments } = await context.params;
  const root = localMediaRoot();

  /*
   * Path traversal defence, in two layers. The segment check rejects the
   * obvious attempts, and the prefix check on the *resolved* path is what
   * actually guarantees containment — including against encodings and symlink
   * tricks the first check would not catch.
   */
  if (segments.some((segment) => segment === '..' || segment.includes('\0'))) {
    return new NextResponse(null, { status: 400 });
  }

  const target = path.resolve(root, ...segments);
  if (!target.startsWith(`${root}${path.sep}`)) {
    return new NextResponse(null, { status: 400 });
  }

  const contentType = CONTENT_TYPES[path.extname(target).toLowerCase()];
  // Only the formats the upload route accepts are served, and always with an
  // explicit type: an unknown extension served as-is is how a stored file turns
  // into a script execution.
  if (!contentType) return new NextResponse(null, { status: 404 });

  try {
    const stats = await stat(target);
    if (!stats.isFile()) return new NextResponse(null, { status: 404 });

    const body = await readFile(target);

    return new NextResponse(new Uint8Array(body), {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(stats.size),
        // Keys are content-addressed, so a given URL can only ever return one
        // byte sequence — it is safe to cache permanently.
        'Cache-Control': 'public, max-age=31536000, immutable',
        // The rest of the hardening — including the `sandbox` CSP that keeps a
        // mistyped response from being treated as an active document — is
        // attached to `/uploads/:path*` in `next.config.ts`, where all response
        // headers live. Setting it here as well would be dead code: the config's
        // headers win.
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return new NextResponse(null, { status: 404 });
    }
    throw error;
  }
}
