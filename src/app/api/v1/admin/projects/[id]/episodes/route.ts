import { defineRoute, idParams } from '@/shared/api/handler';
import { listEpisodesForPicker } from '@/features/projects/episode-queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Episodes of one project, for the pickers that need to name one. */
export const GET = defineRoute({
  auth: 'episode:write',
  rateLimit: 'api:read',
  params: idParams,
  handler: ({ params }) => listEpisodesForPicker(params.id),
});
