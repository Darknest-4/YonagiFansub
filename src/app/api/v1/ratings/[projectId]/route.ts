import { z } from 'zod';
import { defineRoute } from '@/lib/api/handler';
import { ratingSchema } from '@/lib/validation/schemas';
import { clearRating, getRatingSummary, setRating } from '@/server/watch';
import { db } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';
import { CACHE_TAGS, invalidate } from '@/lib/cache';
import { assertFeatureEnabled } from '@/server/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const params = z.object({ projectId: z.string().cuid() });

const RATINGS_OFF = 'Az értékelés jelenleg ki van kapcsolva ezen az oldalon.';

async function requirePublishedProject(projectId: string): Promise<string> {
  const project = await db.project.findFirst({
    where: { id: projectId, deletedAt: null, publishStatus: 'PUBLISHED' },
    select: { slug: true },
  });
  if (!project) throw new NotFoundError('A projekt');
  return project.slug;
}

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
  async handler({ params: { projectId }, body, user }) {
    await assertFeatureEnabled('ratingsEnabled', RATINGS_OFF);
    const slug = await requirePublishedProject(projectId);
    const summary = await setRating(user!.id, projectId, body.score);

    // The project page renders the average, and it is cached.
    invalidate(CACHE_TAGS.project(slug), CACHE_TAGS.projects);

    return summary;
  },
});

export const DELETE = defineRoute({
  auth: 'verified',
  rateLimit: 'rating:write',
  params,
  async handler({ params: { projectId }, user }) {
    await assertFeatureEnabled('ratingsEnabled', RATINGS_OFF);
    const slug = await requirePublishedProject(projectId);
    const summary = await clearRating(user!.id, projectId);

    invalidate(CACHE_TAGS.project(slug), CACHE_TAGS.projects);

    return summary;
  },
});

/** The current standing, for a client that wants it without a page reload. */
export const GET = defineRoute({
  auth: 'public',
  rateLimit: 'api:read',
  params,
  async handler({ params: { projectId }, user }) {
    await requirePublishedProject(projectId);
    return getRatingSummary(projectId, user?.id ?? null);
  },
});
