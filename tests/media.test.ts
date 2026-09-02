import { describe, expect, it } from 'vitest';
import { deflateSync } from 'node:zlib';
import { identifyImage, ALLOWED_IMAGE_TYPES } from '@/features/media/image';
import { deriveSigningKey, signRequest, uriEncode } from '@/infrastructure/storage/s3-signature';

/**
 * Media internals.
 *
 * Two things here are worth testing precisely, because both fail silently:
 * format identification decides whether an upload is safe to store, and the
 * SigV4 implementation is hand-written, so its key derivation is anchored to the
 * value published in AWS's signing documentation rather than to itself.
 */

// ── Fixtures ────────────────────────────────────────────────────────────────
// Built byte by byte rather than checked in as base64 blobs: a reader can see
// exactly which header field the parser is expected to read.

function pngFixture(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13, false); // IHDR length
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  return bytes;
}

function gifFixture(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(14);
  bytes.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 0); // "GIF89a"
  const view = new DataView(bytes.buffer);
  view.setUint16(6, width, true);
  view.setUint16(8, height, true);
  return bytes;
}

/** JPEG with one metadata segment before the frame header, to exercise the walk. */
function jpegFixture(width: number, height: number): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x10, ...new Array<number>(14).fill(0)];
  const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08];
  const bytes = new Uint8Array([
    0xff, 0xd8, 0xff, // SOI + the first byte of the next marker
    ...app0.slice(1), // …continued
    ...sof0,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x03,
    ...new Array<number>(12).fill(0),
  ]);
  return bytes;
}

function webpLossyFixture(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(32);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  bytes.set([0x57, 0x45, 0x42, 0x50], 8); // "WEBP"
  bytes.set([0x56, 0x50, 0x38, 0x20], 12); // "VP8 "
  const view = new DataView(bytes.buffer);
  view.setUint16(26, width, true);
  view.setUint16(28, height, true);
  return bytes;
}

function avifFixture(): Uint8Array {
  const bytes = new Uint8Array(16);
  bytes.set([0x66, 0x74, 0x79, 0x70], 4); // "ftyp"
  bytes.set([0x61, 0x76, 0x69, 0x66], 8); // "avif"
  return bytes;
}

describe('identifyImage', () => {
  it('reads PNG dimensions from the IHDR chunk', () => {
    expect(identifyImage(pngFixture(1200, 630))).toEqual({
      mimeType: 'image/png',
      extension: 'png',
      width: 1200,
      height: 630,
    });
  });

  it('reads GIF dimensions little-endian', () => {
    expect(identifyImage(gifFixture(320, 240))).toMatchObject({
      mimeType: 'image/gif',
      width: 320,
      height: 240,
    });
  });

  it('walks past a JPEG metadata segment to the frame header', () => {
    expect(identifyImage(jpegFixture(1920, 1080))).toMatchObject({
      mimeType: 'image/jpeg',
      extension: 'jpg',
      width: 1920,
      height: 1080,
    });
  });

  it('reads lossy WebP dimensions', () => {
    expect(identifyImage(webpLossyFixture(800, 450))).toMatchObject({
      mimeType: 'image/webp',
      width: 800,
      height: 450,
    });
  });

  it('accepts AVIF without claiming dimensions it cannot read', () => {
    expect(identifyImage(avifFixture())).toEqual({
      mimeType: 'image/avif',
      extension: 'avif',
      width: null,
      height: null,
    });
  });

  it('rejects SVG — it is a script execution context, not just an image', () => {
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>',
    );
    expect(identifyImage(svg)).toBeNull();
    expect(ALLOWED_IMAGE_TYPES).not.toContain('image/svg+xml' as never);
  });

  it('rejects HTML that would be served from our own origin', () => {
    const html = new TextEncoder().encode('<!doctype html><script>alert(1)</script>');
    expect(identifyImage(html)).toBeNull();
  });

  it('rejects a file whose extension lies about its contents', () => {
    // The bytes are a zlib stream; only the name would have said "png".
    expect(identifyImage(new Uint8Array(deflateSync(Buffer.from('not an image'))))).toBeNull();
  });

  it('rejects an empty and a truncated buffer without throwing', () => {
    expect(identifyImage(new Uint8Array(0))).toBeNull();
    expect(identifyImage(new Uint8Array([0x89, 0x50]))).toBeNull();
  });

  it('recognises a PNG whose header is present but body truncated', () => {
    // Still a PNG — it just cannot report a size, which must not be a crash.
    const truncated = pngFixture(10, 10).slice(0, 16);
    expect(identifyImage(truncated)).toMatchObject({ mimeType: 'image/png', width: null });
  });
});

describe('uriEncode', () => {
  it('encodes the characters encodeURIComponent leaves alone', () => {
    expect(uriEncode("a!'()*b", false)).toBe('a%21%27%28%29%2Ab');
  });

  it('keeps slashes in a path and encodes them in a query value', () => {
    expect(uriEncode('a/b', true)).toBe('a/b');
    expect(uriEncode('a/b', false)).toBe('a%2Fb');
  });

  it('encodes multi-byte characters per UTF-8 byte', () => {
    expect(uriEncode('é', false)).toBe('%C3%A9');
  });
});

describe('AWS SigV4', () => {
  /**
   * The derivation vector from AWS's signing documentation. This is the only
   * part of SigV4 with a published expected value, and it is the part where an
   * error stays invisible: a wrong key still produces a well-formed 64-character
   * signature that every self-consistent test would accept and S3 would reject.
   */
  it('derives the signing key to the documented value', () => {
    expect(
      deriveSigningKey(
        'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
        '20120215',
        'us-east-1',
        'iam',
      ).toString('hex'),
    ).toBe('f4780e2d9f65fa895f9c67b32ce1baf0b0d8a43505a000a1a9e090d414db404d');
  });

  it('scopes the credential to the request date, region and service', () => {
    const signed = signRequest({
      method: 'GET',
      url: 'https://example.amazonaws.com/',
      region: 'us-east-1',
      service: 'service',
      accessKeyId: 'AKIDEXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
      now: new Date(Date.UTC(2015, 7, 30, 12, 36, 0)),
    });

    expect(signed.headers['x-amz-date']).toBe('20150830T123600Z');
    expect(signed.headers.Authorization).toContain(
      'Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request',
    );
    // S3 requires the payload hash to be signed, so it is always in the list.
    expect(signed.headers.Authorization).toContain(
      'SignedHeaders=host;x-amz-content-sha256;x-amz-date',
    );
    expect(signed.headers.Authorization).toMatch(/Signature=[0-9a-f]{64}$/);
  });

  it('hashes an empty body to the documented empty-payload digest', () => {
    const signed = signRequest({
      method: 'DELETE',
      url: 'https://bucket.s3.amazonaws.com/a.png',
      region: 'us-east-1',
      accessKeyId: 'AKIDEXAMPLE',
      secretAccessKey: 'secret',
    });

    expect(signed.headers['x-amz-content-sha256']).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('is deterministic for the same inputs', () => {
    const input = {
      method: 'PUT' as const,
      url: 'https://bucket.s3.eu-central-1.amazonaws.com/projects/abc.png',
      region: 'eu-central-1',
      accessKeyId: 'AKIDEXAMPLE',
      secretAccessKey: 'secret',
      body: new Uint8Array([1, 2, 3]),
      now: new Date(Date.UTC(2026, 0, 2, 3, 4, 5)),
    };

    expect(signRequest(input).headers.Authorization).toBe(
      signRequest(input).headers.Authorization,
    );
  });

  it('produces a different signature when the body changes', () => {
    const base = {
      method: 'PUT' as const,
      url: 'https://bucket.s3.amazonaws.com/a.png',
      region: 'us-east-1',
      accessKeyId: 'AKIDEXAMPLE',
      secretAccessKey: 'secret',
      now: new Date(Date.UTC(2026, 0, 2, 3, 4, 5)),
    };

    const first = signRequest({ ...base, body: new Uint8Array([1]) });
    const second = signRequest({ ...base, body: new Uint8Array([2]) });

    expect(first.headers['x-amz-content-sha256']).not.toBe(second.headers['x-amz-content-sha256']);
    expect(first.headers.Authorization).not.toBe(second.headers.Authorization);
  });

  it('never puts the secret in the signed headers', () => {
    const signed = signRequest({
      method: 'DELETE',
      url: 'https://bucket.s3.amazonaws.com/a.png',
      region: 'us-east-1',
      accessKeyId: 'AKIDEXAMPLE',
      secretAccessKey: 'super-secret-value',
      now: new Date(Date.UTC(2026, 0, 2, 3, 4, 5)),
    });

    expect(JSON.stringify(signed)).not.toContain('super-secret-value');
  });
});
