import { z } from 'zod';
import { defineRoute } from '@/shared/api/handler';
import { followProject, unfollowProject } from '@/features/watch/favorites-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const params = z.object({ projectId: z.string().cuid() });

/**
 * Follow / unfollow a project.
 *
 * `PUT` is idempotent by design: tapping "follow" twice, or replaying the
 * request after a flaky connection, must not create a second row or toggle the
 * state back off. The rule itself lives in the service.
 */
export const PUT = defineRoute({
  auth: 'user',
  rateLimit: 'api:write',
  params,
  body: z.object({ notify: z.boolean().default(true) }),
  handler: ({ user, params: { projectId }, body }) =>
    followProject(user!.id, projectId, body.notify),
});

export const DELETE = defineRoute({
  auth: 'user',
  rateLimit: 'api:write',
  params,
  handler: ({ user, params: { projectId } }) => unfollowProject(user!.id, projectId),
});
