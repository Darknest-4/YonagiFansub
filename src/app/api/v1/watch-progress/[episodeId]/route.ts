import { z } from 'zod';
import { defineRoute } from '@/lib/api/handler';
import { watchProgressSchema } from '@/lib/validation/schemas';
import { recordProgress } from '@/server/watch';
import { db } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Records how far into an episode the viewer has got.
 *
 * Called by the player on a timer, so it is written to be cheap and boring: one
 * upsert, no reads the caller waits on, and a rate limit set well above what
 * playback produces.
 *
 * The episode is checked for existence rather than trusted from the path. It is
 * a foreign key either way, but a missing row should come back as a 404 rather
 * than a constraint violation dressed up as a 500.
 */
export const PUT = defineRoute({
  auth: 'user',
  rateLimit: 'watch:progress',
  params: z.object({ episodeId: z.string().cuid() }),
  body: watchProgressSchema,
  async handler({ params, body, user }) {
    const episode = await db.episode.findFirst({
      where: { id: params.episodeId, deletedAt: null },
      select: { id: true },
    });
    if (!episode) throw new NotFoundError('Az epizód');

    await recordProgress({
      userId: user!.id,
      episodeId: params.episodeId,
      positionSec: body.positionSec,
      durationSec: body.durationSec,
      completed: body.completed,
    });

    return { saved: true };
  },
});

/** Forgetting an episode again — the viewer's own "not watched" toggle. */
export const DELETE = defineRoute({
  auth: 'user',
  rateLimit: 'watch:progress',
  params: z.object({ episodeId: z.string().cuid() }),
  async handler({ params, user }) {
    await db.watchProgress
      .delete({
        where: { userId_episodeId: { userId: user!.id, episodeId: params.episodeId } },
      })
      .catch(() => undefined);

    return { saved: true };
  },
});
