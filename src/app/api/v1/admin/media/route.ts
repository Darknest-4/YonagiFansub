import { z } from 'zod';
import { defineRoute } from '@/shared/api/handler';
import { paginationSchema } from '@/shared/api/pagination';
import { BadRequestError, PayloadTooLargeError, UnsupportedMediaTypeError } from '@/shared/lib/errors';
import { mutationContext } from '@/shared/api/mutation-context';
import {
  MAX_UPLOAD_BYTES,
  MEDIA_FOLDERS,
  listMedia,
  storeUpload,
  type MediaFolder,
} from '@/features/media/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const mediaQuerySchema = paginationSchema.extend({
  folder: z.enum(MEDIA_FOLDERS).optional(),
  q: z.string().trim().max(120).optional(),
});

export const GET = defineRoute({
  auth: 'media:write',
  rateLimit: 'api:read',
  query: mediaQuerySchema,
  async handler({ query }) {
    return listMedia(
      { folder: query.folder, q: query.q },
      { page: query.page, perPage: query.perPage },
    );
  },
  meta: (result) => result.meta,
});

/**
 * Upload.
 *
 * The only endpoint that reads a body `defineRoute` does not parse: the factory
 * handles JSON, and a file is not JSON. Everything else the factory provides —
 * rate limit, CSRF and same-origin, permission check, error envelope, access log
 * — still applies, so the exception is the body format and nothing more.
 *
 * The size is checked twice on purpose. `Content-Length` is a claim, refuted
 * cheaply before any bytes are read; the length of the buffer is the fact,
 * checked in `storeUpload` after they are.
 */
export const POST = defineRoute({
  auth: 'media:write',
  rateLimit: 'admin:write',
  async handler({ req, user, ipHash, userAgent, requestId }) {
    const contentType = req.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      throw new UnsupportedMediaTypeError('A feltöltés csak multipart/form-data lehet.');
    }

    const declaredLength = Number(req.headers.get('content-length') ?? '0');
    if (declaredLength > MAX_UPLOAD_BYTES * 1.1) throw new PayloadTooLargeError();

    const form = await req.formData().catch(() => {
      throw new BadRequestError('A feltöltés törzse hibás.');
    });

    const file = form.get('file');
    if (!(file instanceof File)) {
      throw new BadRequestError('Hiányzik a `file` mező.');
    }

    const folderValue = form.get('folder');
    const folder = z
      .enum(MEDIA_FOLDERS)
      .catch('general' as MediaFolder)
      .parse(typeof folderValue === 'string' ? folderValue : undefined);

    const altValue = form.get('alt');
    const alt = typeof altValue === 'string' ? altValue.slice(0, 300) : null;

    const result = await storeUpload({
      bytes: new Uint8Array(await file.arrayBuffer()),
      folder,
      alt,
      uploadedById: user?.id ?? null,
    });

    // A deduplicated upload wrote nothing, so there is nothing to record: the
    // audit trail should show what changed, not what was attempted.
    if (!result.deduplicated) {
      const context = mutationContext(user!, { ipHash, userAgent, requestId });
      await context.audit({
        action: 'CREATE',
        entityType: 'MediaAsset',
        entityId: result.asset.id,
        summary: `Médiafájl feltöltve: ${result.asset.key}`,
      });
    }

    return result;
  },
});
