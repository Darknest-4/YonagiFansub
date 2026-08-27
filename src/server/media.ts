import 'server-only';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { mediaDriver } from '@/lib/media/driver';
import { ALLOWED_IMAGE_TYPES, identifyImage } from '@/lib/media/image';
import { BadRequestError, NotFoundError, PayloadTooLargeError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import {
  DEFAULT_PER_PAGE,
  paginationMeta,
  toSkipTake,
  type PaginationInput,
} from '@/lib/api/pagination';

/**
 * Media library.
 *
 * Two rules shape this module:
 *
 * 1. **Nothing is trusted from the request.** The declared content type and the
 *    filename are ignored entirely; the stored type comes from the file's own
 *    magic bytes (`lib/media/image.ts`), and the stored key is generated here.
 *    An upload therefore cannot choose where it lands or what it is served as.
 *
 * 2. **Storage keys are content-addressed.** The key contains a SHA-256 prefix
 *    of the bytes, which makes re-uploading the same file a no-op instead of a
 *    duplicate, lets objects be cached immutably forever, and means a key can
 *    never collide or be guessed from the original filename.
 */

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB — cover art, banners, avatars.

/** Folders exist to keep the library browsable; they are not a security boundary. */
export const MEDIA_FOLDERS = ['general', 'projects', 'episodes', 'news', 'team'] as const;
export type MediaFolder = (typeof MEDIA_FOLDERS)[number];

export const mediaAssetArgs = Prisma.validator<Prisma.MediaAssetDefaultArgs>()({
  select: {
    id: true,
    key: true,
    url: true,
    mimeType: true,
    sizeBytes: true,
    width: true,
    height: true,
    alt: true,
    folder: true,
    createdAt: true,
    uploadedBy: { select: { username: true, displayName: true } },
  },
});

type MediaAssetRow = Prisma.MediaAssetGetPayload<typeof mediaAssetArgs>;

/** `sizeBytes` is a `BigInt` in the database and a string here — see `lib/cache.ts`. */
export type MediaAssetItem = Omit<MediaAssetRow, 'sizeBytes'> & { sizeBytes: string };

function toItem(row: MediaAssetRow): MediaAssetItem {
  return { ...row, sizeBytes: row.sizeBytes.toString() };
}

export interface UploadInput {
  bytes: Uint8Array;
  folder: MediaFolder;
  alt?: string | null;
  uploadedById?: string | null;
}

export interface UploadResult {
  asset: MediaAssetItem;
  /** True when the bytes were already in the library and nothing was written. */
  deduplicated: boolean;
}

export async function storeUpload(input: UploadInput): Promise<UploadResult> {
  if (input.bytes.byteLength === 0) {
    throw new BadRequestError('A feltöltött fájl üres.');
  }
  if (input.bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new PayloadTooLargeError(
      `A fájl mérete legfeljebb ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB lehet.`,
    );
  }

  const image = identifyImage(input.bytes);
  if (!image) {
    throw new BadRequestError(
      `Nem támogatott képformátum. Engedélyezett: ${ALLOWED_IMAGE_TYPES.join(', ')}.`,
    );
  }

  const checksum = createHash('sha256').update(input.bytes).digest('hex');

  // Content addressing: the same bytes always produce the same key, so a repeat
  // upload returns the existing asset instead of a second copy of the file.
  const existing = await db.mediaAsset.findFirst({
    where: { checksum },
    ...mediaAssetArgs,
  });

  if (existing) return { asset: toItem(existing), deduplicated: true };

  const key = `${input.folder}/${checksum.slice(0, 24)}.${image.extension}`;
  const stored = await mediaDriver().put(key, input.bytes, image.mimeType);

  const asset = await db.mediaAsset.create({
    data: {
      key: stored.key,
      url: stored.url,
      mimeType: image.mimeType,
      sizeBytes: BigInt(input.bytes.byteLength),
      width: image.width,
      height: image.height,
      alt: input.alt?.trim() || null,
      checksum,
      folder: input.folder,
      uploadedById: input.uploadedById ?? null,
    },
    ...mediaAssetArgs,
  });

  return { asset: toItem(asset), deduplicated: false };
}

export interface MediaListFilters {
  folder?: MediaFolder;
  q?: string;
}

export async function listMedia(
  filters: MediaListFilters,
  pagination: PaginationInput,
): Promise<{ items: MediaAssetItem[]; meta: ReturnType<typeof paginationMeta> }> {
  const where: Prisma.MediaAssetWhereInput = {};
  if (filters.folder) where.folder = filters.folder;
  if (filters.q) {
    where.OR = [
      { alt: { contains: filters.q, mode: 'insensitive' } },
      { key: { contains: filters.q, mode: 'insensitive' } },
    ];
  }

  const [rows, total] = await Promise.all([
    db.mediaAsset.findMany({
      where,
      ...mediaAssetArgs,
      orderBy: { createdAt: 'desc' },
      ...toSkipTake(pagination),
    }),
    db.mediaAsset.count({ where }),
  ]);

  return { items: rows.map(toItem), meta: paginationMeta(total, pagination) };
}

export async function getMediaAsset(id: string): Promise<MediaAssetItem> {
  const asset = await db.mediaAsset.findUnique({ where: { id }, ...mediaAssetArgs });
  if (!asset) throw new NotFoundError('A médiafájl nem található.');
  return toItem(asset);
}

export async function updateMediaAlt(id: string, alt: string | null): Promise<MediaAssetItem> {
  const asset = await db.mediaAsset
    .update({ where: { id }, data: { alt: alt?.trim() || null }, ...mediaAssetArgs })
    .catch(() => {
      throw new NotFoundError('A médiafájl nem található.');
    });

  return toItem(asset);
}

/**
 * Removes the row, then the object.
 *
 * That order is deliberate: a row without a file shows a broken image, which is
 * visible and fixable, while a file without a row is an orphan that nothing will
 * ever reclaim. If the storage delete fails the row is already gone, so the
 * failure is logged rather than propagated — the user's action succeeded.
 */
export async function deleteMedia(id: string): Promise<MediaAssetItem> {
  const asset = await db.mediaAsset.findUnique({ where: { id }, ...mediaAssetArgs });
  if (!asset) throw new NotFoundError('A médiafájl nem található.');

  await db.mediaAsset.delete({ where: { id } });

  try {
    await mediaDriver().delete(asset.key);
  } catch (error) {
    logger.error('A médiafájl törlése a tárolóból nem sikerült', error, { key: asset.key });
  }

  return toItem(asset);
}

/** Total library size, for the dashboard and the media page header. */
export async function mediaUsage(): Promise<{ count: number; totalBytes: string }> {
  const [count, sum] = await Promise.all([
    db.mediaAsset.count(),
    db.mediaAsset.aggregate({ _sum: { sizeBytes: true } }),
  ]);

  return { count, totalBytes: (sum._sum.sizeBytes ?? BigInt(0)).toString() };
}

export const DEFAULT_MEDIA_PER_PAGE = DEFAULT_PER_PAGE;
