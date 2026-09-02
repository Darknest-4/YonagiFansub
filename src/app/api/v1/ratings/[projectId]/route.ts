import { z } from 'zod';
import { defineRoute } from '@/shared/api/handler';
import { ratingSchema } from '@/features/watch/schemas';
import { rateProject, readProjectRating, unrateProject } from '@/features/watch/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const params = z.object({ projectId: z.string().cuid() });

/**
 * Casting or changing a vote.
 *
 * Requires a verified address, like commenting does. A score is a public
 * statement about somebody's work, and an unverified account is an
 * unaccountable one — which is exactly what a throwaway registration is for.
 *
 * The upsert means voting twice changes the vote rather than adding one; the
 * composite primary key enforces that in the database, so a double submit
 * cannot slip a second row through.
 */
export const PUT = defineRoute({
  auth: 'verified',
  rateLimit: 'rating:write',
  params,
  body: ratingSchema,
  handler: ({ params: { projectId }, body, user }) => rateProject(user!.id, projectId, body.score),
});

export const DELETE = defineRoute({
  auth: 'verified',
  rateLimit: 'rating:write',
  params,
  handler: ({ params: { projectId }, user }) => unrateProject(user!.id, projectId),
});

/** The current standing, for a client that wants it without a page reload. */
export const GET = defineRoute({
  auth: 'public',
  rateLimit: 'api:read',
  params,
  handler: ({ params: { projectId }, user }) => readProjectRating(projectId, user?.id ?? null),
});
