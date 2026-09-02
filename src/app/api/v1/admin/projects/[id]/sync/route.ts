import { z } from 'zod';
import { defineRoute, idParams } from '@/shared/api/handler';
import { syncProjectMetadata } from '@/features/metadata/sync-service';
import { mutationContext } from '@/shared/api/mutation-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Refresh one project from its stored ids. */
export const POST = defineRoute({
  auth: 'project:write',
  rateLimit: 'admin:write',
  params: idParams,
  body: z.object({
    /** Replace the curated fields too — the deliberate "re-import" action. */
    overwriteEditorial: z.boolean().default(false),
    skipEpisodes: z.boolean().default(false),
  }),
  async handler({ params, body, user, ipHash, userAgent, requestId }) {
    return syncProjectMetadata(
      params.id,
      { overwriteEditorial: body.overwriteEditorial, skipEpisodes: body.skipEpisodes },
      mutationContext(user!, { ipHash, userAgent, requestId }),
    );
  },
});
