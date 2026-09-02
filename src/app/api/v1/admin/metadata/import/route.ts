import { z } from 'zod';
import { defineRoute } from '@/shared/api/handler';
import { importProjectFromMetadata } from '@/features/metadata/sync-service';
import { mutationContext } from '@/shared/api/mutation-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Create a whole project from an AniList or MyAnimeList id.
 *
 * At least one id is required, which the schema enforces with a refinement
 * rather than leaving the service to discover it: a 422 naming the field beats a
 * 400 from two API calls deep.
 */
export const POST = defineRoute({
  auth: 'project:write',
  rateLimit: 'admin:write',
  body: z
    .object({
      anilistId: z.coerce.number().int().positive().nullish(),
      malId: z.coerce.number().int().positive().nullish(),
      slug: z
        .string()
        .trim()
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Csak kisbetű, szám és kötőjel.')
        .max(120)
        .optional(),
    })
    .refine((value) => Boolean(value.anilistId || value.malId), {
      message: 'Adj meg legalább egy azonosítót.',
      path: ['anilistId'],
    }),
  async handler({ body, user, ipHash, userAgent, requestId }) {
    return importProjectFromMetadata(
      { anilistId: body.anilistId, malId: body.malId, slug: body.slug },
      mutationContext(user!, { ipHash, userAgent, requestId }),
    );
  },
});
