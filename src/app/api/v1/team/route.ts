import { defineRoute } from '@/lib/api/handler';
import { listTeam } from '@/server/team';

export const runtime = 'nodejs';

export const GET = defineRoute({
  auth: 'public',
  rateLimit: 'api:read',
  cache: { sMaxAge: 600 },
  async handler() {
    return listTeam(false);
  },
});
