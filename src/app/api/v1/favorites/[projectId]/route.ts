import { z } from 'zod';
import { defineRoute } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';
import { invalidate, CACHE_TAGS } from '@/lib/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const params = z.object({ projectId: z.string().cuid() });

/**
 * Follow / unfollow a project.
 *
 * `PUT` is idempotent by design: tapping "follow" twice, or replaying the
 * request after a flaky connection, must not create a second row or toggle the
 * state back off.
 */
export const PUT = defineRoute({
  auth: 'user',
  rateLimit: 'api:write',
  params,
  body: z.object({ notify: z.boolean().default(true) }),
  async handler({ user, params: { projectId }, body }) {
    const project = await db.project.findFirst({
      where: { id: projectId, deletedAt: null, publishStatus: 'PUBLISHED' },
      select: { id: true },
    });
    if (!project) throw new NotFoundError('A projekt');

    await db.favorite.upsert({
      where: { userId_projectId: { userId: user!.id, projectId } },
      create: { userId: user!.id, projectId, notify: body.notify },
      update: { notify: body.notify },
    });

    invalidate(CACHE_TAGS.project(projectId));
    return { following: true, notify: body.notify };
  },
});

export const DELETE = defineRoute({
  auth: 'user',
  rateLimit: 'api:write',
  params,
  async handler({ user, params: { projectId } }) {
    await db.favorite.deleteMany({ where: { userId: user!.id, projectId } });
    return { following: false };
  },
});
