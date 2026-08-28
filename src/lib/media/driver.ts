import 'server-only';
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { signRequest } from '@/lib/media/s3-signature';

/**
 * Object storage, behind one interface with two implementations.
 *
 * Same shape as the mail and rate-limit drivers: the application depends on the
 * capability, the deployment picks the backing service through `MEDIA_DRIVER`.
 * That keeps `npm run dev` free of cloud credentials while production writes to
 * a bucket, with no branching anywhere above this file.
 */

export interface StoredObject {
  key: string;
  url: string;
}

export interface MediaDriver {
  put(key: string, body: Uint8Array, contentType: string): Promise<StoredObject>;
  delete(key: string): Promise<void>;
  publicUrl(key: string): string;
  /**
   * Reads an object back.
   *
   * Needed by protected video playback, which serves bytes through an
   * authorising proxy instead of handing out a storage URL. Returns `null` for a
   * missing key rather than throwing: "not there" is an ordinary answer, and a
   * 404 is what the caller wants to send anyway.
   *
   * `range` is passed through so the browser can seek without the server
   * buffering a whole segment.
   */
  get(key: string, range?: string | null): Promise<StoredBytes | null>;
}

/**
 * Content types for the objects protected playback serves.
 *
 * Kept to what an HLS package contains. Guessing broadly here would mean this
 * proxy could be pointed at arbitrary keys and asked to label them helpfully,
 * which is the sort of thing that turns a media route into a file server.
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

/**
 * Parses a single-range `Range` header.
 *
 * Multi-range requests are answered with the whole object instead: no browser
 * media stack asks for one, and implementing multipart/byteranges to serve a
 * request nobody makes is code that can only ever be a liability.
 */
export function parseRange(
  header: string | null | undefined,
  size: number,
): { start: number; end: number } | null {
  if (!header) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, rawStart, rawEnd] = match;

  // `bytes=-500` means the last 500 bytes, not "up to 500".
  if (!rawStart) {
    const length = Number(rawEnd);
    if (!length || Number.isNaN(length)) return null;
    return { start: Math.max(0, size - length), end: size - 1 };
  }

  const start = Number(rawStart);
  const end = rawEnd ? Math.min(Number(rawEnd), size - 1) : size - 1;

  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) return null;
  return { start, end };
}

export interface StoredBytes {
  body: ReadableStream<Uint8Array> | Uint8Array;
  contentType: string | null;
  contentLength: number | null;
  /** Present when the driver honoured a range request. */
  contentRange?: string | null;
  status: 200 | 206;
}

/** Absolute path of the local upload directory. Shared with the serving route. */
export function localMediaRoot(): string {
  return path.resolve(process.cwd(), env.MEDIA_LOCAL_DIR);
}

/**
 * Local disk, under `MEDIA_LOCAL_DIR`.
 *
 * The default, and the right choice for development and for a single-node
 * deployment with a mounted volume. It is deliberately *not* the right choice
 * for a horizontally scaled or immutable-filesystem deployment: files written by
 * one instance are invisible to the others. `MEDIA_DRIVER=s3` is the answer
 * there, which is why the driver is configuration rather than a code change.
 *
 * The directory sits outside `public/` and is served by the
 * `/uploads/[...path]` route — see `MEDIA_LOCAL_DIR` in `lib/env.ts` for why
 * `public/` cannot work for files written after the build.
 */
class LocalDriver implements MediaDriver {
  private readonly root = localMediaRoot();

  async put(key: string, body: Uint8Array, _contentType: string): Promise<StoredObject> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
    return { key, url: this.publicUrl(key) };
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.resolve(key));
    } catch (error) {
      // A missing file is the desired end state, not a failure.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  publicUrl(key: string): string {
    return `${env.MEDIA_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`;
  }

  async get(key: string, range?: string | null): Promise<StoredBytes | null> {
    const target = this.resolve(key);

    let size: number;
    try {
      size = (await stat(target)).size;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }

    const parsed = parseRange(range, size);
    const body = await readFile(target);

    if (!parsed) {
      return {
        body: new Uint8Array(body),
        contentType: contentTypeFor(key),
        contentLength: size,
        status: 200,
      };
    }

    const slice = new Uint8Array(body.subarray(parsed.start, parsed.end + 1));
    return {
      body: slice,
      contentType: contentTypeFor(key),
      contentLength: slice.byteLength,
      contentRange: `bytes ${parsed.start}-${parsed.end}/${size}`,
      status: 206,
    };
  }

  /**
   * Keys are generated by this application and never taken from user input, but
   * a path traversal here would write anywhere on the filesystem — so the
   * containment is enforced rather than assumed.
   */
  private resolve(key: string): string {
    const target = path.resolve(this.root, key);
    if (target !== this.root && !target.startsWith(`${this.root}${path.sep}`)) {
      throw new Error('A média kulcsa kilépne a tárolási könyvtárból.');
    }
    return target;
  }
}

/**
 * S3-compatible object storage: AWS S3, Cloudflare R2, Backblaze B2, MinIO.
 *
 * Uses `fetch` with a hand-signed request (`s3-signature.ts`) instead of the AWS
 * SDK — see that module for why. Path-style addressing is used when an explicit
 * endpoint is configured, because that is what the S3-compatible services
 * expect; virtual-host style is used for AWS itself.
 */
class S3Driver implements MediaDriver {
  private readonly bucket = env.S3_BUCKET as string;
  private readonly region = env.S3_REGION ?? 'us-east-1';

  async put(key: string, body: Uint8Array, contentType: string): Promise<StoredObject> {
    const response = await this.send('PUT', key, body, {
      'content-type': contentType,
      // Objects are immutable: the key contains the content hash, so a given key
      // can only ever hold one byte sequence.
      'cache-control': 'public, max-age=31536000, immutable',
    });

    if (!response.ok) {
      throw new Error(`S3 feltöltés sikertelen (${response.status}): ${await response.text()}`);
    }

    return { key, url: this.publicUrl(key) };
  }

  async delete(key: string): Promise<void> {
    const response = await this.send('DELETE', key);
    // S3 answers 204 for a delete, and also for a key that was never there.
    if (!response.ok && response.status !== 404) {
      throw new Error(`S3 törlés sikertelen (${response.status}).`);
    }
  }

  publicUrl(key: string): string {
    // A CDN or custom domain in front of the bucket is the common production
    // setup, so the public URL is configured independently of the write path.
    return `${env.MEDIA_PUBLIC_BASE_URL.replace(/\/$/, '')}/${key}`;
  }

  private objectUrl(key: string): string {
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');

    if (env.S3_ENDPOINT) {
      const endpoint = env.S3_ENDPOINT.replace(/\/$/, '');
      return `${endpoint}/${this.bucket}/${encodedKey}`;
    }

    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${encodedKey}`;
  }

  async get(key: string, range?: string | null): Promise<StoredBytes | null> {
    const response = await this.send('GET', key, undefined, range ? { range } : undefined);

    if (response.status === 404) return null;
    if (!response.ok && response.status !== 206) {
      throw new Error(`S3 olvasás sikertelen (${response.status}).`);
    }

    const length = Number(response.headers.get('content-length'));

    /*
      The body is streamed rather than buffered. A video segment is a few
      megabytes and a movie is thousands of them; reading each one fully into
      memory before answering would put the whole file through the server's heap
      for no benefit, since the client consumes it in order anyway.
    */
    return {
      body: response.body ?? new Uint8Array(),
      // The bucket's stored type wins, since it was set at upload; our
      // extension map is the fallback for objects uploaded without one.
      contentType: response.headers.get('content-type') ?? contentTypeFor(key),
      contentLength: Number.isFinite(length) ? length : null,
      contentRange: response.headers.get('content-range'),
      status: response.status === 206 ? 206 : 200,
    };
  }

  private send(
    method: 'GET' | 'PUT' | 'DELETE',
    key: string,
    body?: Uint8Array,
    headers?: Record<string, string>,
  ): Promise<Response> {
    const signed = signRequest({
      method,
      url: this.objectUrl(key),
      region: this.region,
      accessKeyId: env.S3_ACCESS_KEY_ID as string,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY as string,
      headers,
      body,
    });

    return fetch(signed.url, {
      method: signed.method,
      headers: signed.headers,
      body: body ? Buffer.from(body) : undefined,
    });
  }
}

function createDriver(): MediaDriver {
  if (env.MEDIA_DRIVER === 's3') {
    // `env.ts` already refuses to start without S3_BUCKET; this covers the
    // credentials, which it cannot require (IAM roles supply them elsewhere).
    if (!env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
      logger.error(
        'MEDIA_DRIVER=s3 but S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY are missing — falling back to local disk.',
      );
      return new LocalDriver();
    }
    return new S3Driver();
  }

  return new LocalDriver();
}

let instance: MediaDriver | null = null;

export function mediaDriver(): MediaDriver {
  instance ??= createDriver();
  return instance;
}
