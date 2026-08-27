/**
 * Image identification, from the bytes rather than from the request.
 *
 * An upload's `Content-Type` and filename extension are attacker-controlled, so
 * neither may decide what a file is. This module reads the actual signature and
 * the intrinsic dimensions out of the buffer, and the upload route stores only
 * what it recognises here.
 *
 * That is also why SVG is not on the list. It is a legitimate image format and a
 * script execution context at the same time: an `<svg>` with an `onload` served
 * from our own origin is stored XSS. Accepting it safely would mean a sanitiser,
 * a separate asset origin, or a strict `Content-Disposition` — all real options,
 * none of them free, and none of them needed for cover art and avatars.
 *
 * No image decoding library is involved. Dimensions live in a fixed header at
 * the front of every format below, and parsing those few bytes avoids a native
 * dependency that would have to be rebuilt for every deployment target.
 */

export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
] as const;

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

export const IMAGE_EXTENSION: Record<AllowedImageType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

export interface ImageInfo {
  mimeType: AllowedImageType;
  extension: string;
  width: number | null;
  height: number | null;
}

function startsWith(buffer: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (buffer.length < offset + signature.length) return false;
  return signature.every((byte, index) => buffer[offset + index] === byte);
}

function ascii(buffer: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...buffer.subarray(offset, offset + length));
}

/**
 * Recognises the format from its magic bytes, then reads the dimensions.
 * Returns `null` for anything not on the allowlist — including a file that only
 * claims to be one of them.
 */
export function identifyImage(bytes: Uint8Array): ImageInfo | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // ── PNG: 8-byte signature, then the IHDR chunk with two big-endian uint32s ──
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return {
      mimeType: 'image/png',
      extension: 'png',
      width: bytes.length >= 24 ? view.getUint32(16, false) : null,
      height: bytes.length >= 24 ? view.getUint32(20, false) : null,
    };
  }

  // ── GIF: "GIF87a"/"GIF89a", then two little-endian uint16s ──────────────────
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) {
    return {
      mimeType: 'image/gif',
      extension: 'gif',
      width: bytes.length >= 10 ? view.getUint16(6, true) : null,
      height: bytes.length >= 10 ? view.getUint16(8, true) : null,
    };
  }

  // ── JPEG: SOI, then a walk over the segment chain to the frame header ───────
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { mimeType: 'image/jpeg', extension: 'jpg', ...readJpegSize(bytes, view) };
  }

  // ── RIFF container: "RIFF" … "WEBP" ────────────────────────────────────────
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && ascii(bytes, 8, 4) === 'WEBP') {
    return { mimeType: 'image/webp', extension: 'webp', ...readWebpSize(bytes, view) };
  }

  // ── ISO-BMFF: "ftyp" at offset 4, with an AVIF brand ───────────────────────
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === 'ftyp') {
    const brand = ascii(bytes, 8, 4);
    if (brand === 'avif' || brand === 'avis') {
      // AVIF dimensions sit in an `ispe` box whose position is not fixed. The
      // browser reads them from the file itself, so leaving these null costs
      // only the layout hint, never correctness.
      return { mimeType: 'image/avif', extension: 'avif', width: null, height: null };
    }
  }

  return null;
}

/**
 * JPEG has no fixed header: the size lives in the SOFn segment, somewhere after
 * an arbitrary number of metadata segments (EXIF, ICC, comments). Walking the
 * chain is the only correct way to find it.
 */
function readJpegSize(
  bytes: Uint8Array,
  view: DataView,
): { width: number | null; height: number | null } {
  let offset = 2;

  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1; // Re-sync over padding bytes rather than giving up.
      continue;
    }

    const marker = bytes[offset + 1] as number;

    // Standalone markers carry no length field.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }

    // Start of scan: past this point is entropy-coded data, not segments.
    if (marker === 0xda) break;

    const length = view.getUint16(offset + 2, false);
    if (length < 2) break;

    // SOF0…SOF15, excluding DHT (c4), JPG (c8) and DAC (cc).
    const isFrameHeader =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isFrameHeader && offset + 9 < bytes.length) {
      return {
        height: view.getUint16(offset + 5, false),
        width: view.getUint16(offset + 7, false),
      };
    }

    offset += 2 + length;
  }

  return { width: null, height: null };
}

/**
 * WebP comes in three flavours and each stores its size differently:
 * VP8 (lossy), VP8L (lossless, bit-packed) and VP8X (extended, 24-bit minus one).
 */
function readWebpSize(
  bytes: Uint8Array,
  view: DataView,
): { width: number | null; height: number | null } {
  if (bytes.length < 30) return { width: null, height: null };
  const format = ascii(bytes, 12, 4);

  if (format === 'VP8 ') {
    return {
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff,
    };
  }

  if (format === 'VP8L') {
    const bits = view.getUint32(21, true);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }

  if (format === 'VP8X') {
    const readUint24 = (offset: number) =>
      (bytes[offset] as number) |
      ((bytes[offset + 1] as number) << 8) |
      ((bytes[offset + 2] as number) << 16);
    return { width: readUint24(24) + 1, height: readUint24(27) + 1 };
  }

  return { width: null, height: null };
}
