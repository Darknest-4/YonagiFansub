import { createHash, createHmac } from 'node:crypto';

/**
 * AWS Signature Version 4, for the two S3 operations this application performs:
 * `PUT object` and `DELETE object`.
 *
 * Implemented directly rather than through `@aws-sdk/client-s3`, which brings a
 * large dependency tree and a middleware stack to sign two requests. SigV4 is a
 * fully specified, deterministic algorithm; `tests/media.test.ts` verifies this
 * implementation against AWS's own published test vector, so "we wrote it
 * ourselves" does not mean "we hope it is right".
 *
 * The signing key never leaves this module, and the secret is never logged: the
 * only thing that escapes is the `Authorization` header value.
 */

export interface SignedRequestInput {
  method: 'PUT' | 'DELETE' | 'GET';
  /** Full request URL, including the bucket, however the endpoint style requires. */
  url: string;
  region: string;
  service?: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Extra headers to sign. `host` and `x-amz-*` are always signed. */
  headers?: Record<string, string>;
  /** Raw request body; empty for DELETE. */
  body?: Uint8Array;
  /** Injectable for tests — defaults to now. */
  now?: Date;
}

const UNSIGNED_CHARACTERS = /[^A-Za-z0-9\-._~]/g;

/**
 * S3 requires the *path* to be encoded with `/` left intact, and requires
 * `encodeURIComponent`'s exemptions (`!`, `'`, `(`, `)`, `*`) to be encoded.
 * Getting either wrong produces a signature mismatch that reads like a
 * credential problem, so the encoding lives in one named function.
 */
export function uriEncode(input: string, keepSlashes: boolean): string {
  return input.replace(UNSIGNED_CHARACTERS, (character) => {
    if (character === '/' && keepSlashes) return '/';
    return Array.from(new TextEncoder().encode(character))
      .map((byte) => `%${byte.toString(16).toUpperCase().padStart(2, '0')}`)
      .join('');
  });
}

function sha256Hex(data: Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

/** `20260827T203900Z` and `20260827`, the two formats SigV4 asks for. */
function timestamps(now: Date): { amzDate: string; dateStamp: string } {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}

export interface SignedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
}

/**
 * The four chained HMACs that turn a long-lived secret into a key scoped to one
 * day, region and service.
 *
 * Exported so it can be checked against the derivation vector published in the
 * AWS signing documentation — the one part of SigV4 with a fixed, quotable
 * expected value, and the part where a mistake produces a signature that is
 * wrong in a way no amount of self-consistent testing would reveal.
 */
export function deriveSigningKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service: string,
): Buffer {
  return hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), region), service), 'aws4_request');
}

export function signRequest(input: SignedRequestInput): SignedRequest {
  const service = input.service ?? 's3';
  const now = input.now ?? new Date();
  const { amzDate, dateStamp } = timestamps(now);
  const url = new URL(input.url);
  const body = input.body ?? new Uint8Array(0);
  const payloadHash = sha256Hex(body);

  const headers: Record<string, string> = {
    ...input.headers,
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };

  // ── Canonical request ──────────────────────────────────────────────────────
  const signedHeaderNames = Object.keys(headers)
    .map((name) => name.toLowerCase())
    .sort();

  const canonicalHeaders = signedHeaderNames
    .map((name) => {
      const value = Object.entries(headers).find(
        ([key]) => key.toLowerCase() === name,
      )?.[1] as string;
      // Header values are trimmed and internal runs of whitespace collapsed.
      return `${name}:${value.trim().replace(/\s+/g, ' ')}\n`;
    })
    .join('');

  const canonicalQuery = [...url.searchParams.entries()]
    .map(([key, value]) => [uriEncode(key, false), uriEncode(value, false)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  const canonicalRequest = [
    input.method,
    uriEncode(decodeURIComponent(url.pathname), true),
    canonicalQuery,
    canonicalHeaders,
    signedHeaderNames.join(';'),
    payloadHash,
  ].join('\n');

  // ── String to sign ─────────────────────────────────────────────────────────
  const scope = `${dateStamp}/${input.region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const signingKey = deriveSigningKey(input.secretAccessKey, dateStamp, input.region, service);
  const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

  return {
    url: input.url,
    method: input.method,
    headers: {
      ...headers,
      Authorization:
        `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, ` +
        `SignedHeaders=${signedHeaderNames.join(';')}, Signature=${signature}`,
    },
  };
}
