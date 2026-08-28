import { z } from 'zod';
import { defineRoute, idParams } from '@/lib/api/handler';
import { syncProjectMetadata } from '@/server/admin/metadata-sync';
import { mutationContext } from '@/server/admin/context';

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
