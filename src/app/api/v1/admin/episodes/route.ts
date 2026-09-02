import { z } from 'zod';
import { defineRoute } from '@/shared/api/handler';
import { NotFoundError } from '@/shared/lib/errors';
import { episodeWriteSchema } from '@/features/projects/schemas';
import { createEpisode, lookupEpisode } from '@/features/projects/episode-admin-service';
import { mutationContext } from '@/shared/api/mutation-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Episode lookup by project slug and number.
 *
 * The pair a person knows, rather than the id every admin screen already has.
 * It exists for `npm run hls --register`, which is invoked with a filename and
 * a storage key and has no way to learn a cuid — and asking an encoder to copy
 * one out of a browser URL is the manual step that feature removes.
 *
 * Behind `episode:write` rather than `episode:read`: the only caller is about to
 * write, and a narrower read permission here would let an account look up
 * episodes it could not act on, for no benefit.
 */
export const GET = defineRoute({
  auth: 'episode:write',
  rateLimit: 'api:read',
  query: z.object({
    project: z.string().trim().min(1).max(120),
    number: z.coerce.number().min(0).max(9999),
  }),
  async handler({ query }) {
    const episode = await lookupEpisode(query.project, query.number);
    if (!episode) throw new NotFoundError('Az epizód');
    return { ...episode, number: Number(episode.number) };
  },
});

export const POST = defineRoute({
  auth: 'episode:write',
  rateLimit: 'admin:write',
  body: episodeWriteSchema,
  async handler({ body, user, ipHash, userAgent, requestId }) {
    return createEpisode(body, mutationContext(user!, { ipHash, userAgent, requestId }));
  },
});
