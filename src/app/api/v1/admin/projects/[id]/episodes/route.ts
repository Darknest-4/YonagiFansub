import { defineRoute, idParams } from '@/lib/api/handler';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Episodes of one project, for the release editor's episode picker.
 *
 * Exists as its own endpoint so the editor can load episodes on demand rather
 * than the release form shipping every episode of every project up front — that
 * payload grows without bound as the catalogue does.
 */
export const GET = defineRoute({
  auth: 'release:write',
  rateLimit: 'api:read',
  params: idParams,
  async handler({ params }) {
    return db.episode.findMany({
      where: { projectId: params.id, deletedAt: null },
      orderBy: { number: 'asc' },
      select: { id: true, number: true, title: true },
    });
  },
});
