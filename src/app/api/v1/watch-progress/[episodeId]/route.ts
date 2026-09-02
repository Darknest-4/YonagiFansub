import { z } from 'zod';
import { defineRoute } from '@/shared/api/handler';
import { watchProgressSchema } from '@/features/watch/schemas';
import { forgetWatchProgress, saveWatchProgress } from '@/features/watch/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const params = z.object({ episodeId: z.string().cuid() });

/**
 * Records how far into an episode the viewer has got.
 *
 * Called by the player on a timer, so it is written to be cheap and boring: one
 * upsert, no reads the caller waits on, and a rate limit set well above what
 * playback produces.
 */
export const PUT = defineRoute({
  auth: 'user',
  rateLimit: 'watch:progress',
  params,
  body: watchProgressSchema,
  handler: ({ params, body, user }) =>
    saveWatchProgress({
      userId: user!.id,
      episodeId: params.episodeId,
      positionSec: body.positionSec,
      durationSec: body.durationSec,
      completed: body.completed,
    }),
});

/** Forgetting an episode again — the viewer's own "not watched" toggle. */
export const DELETE = defineRoute({
  auth: 'user',
  rateLimit: 'watch:progress',
  params,
  handler: ({ params, user }) => forgetWatchProgress(user!.id, params.episodeId),
});
