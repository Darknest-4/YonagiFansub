import { defineRoute } from '@/lib/api/handler';
import { listTeam } from '@/server/team';

// Rendered per request: the response depends on the database, which is not
// reachable during `next build`. See `(site)/layout.tsx` for the full reasoning.
export const dynamic = 'force-dynamic';

export const runtime = 'nodejs';

export const GET = defineRoute({
  auth: 'public',
  rateLimit: 'api:read',
  cache: { sMaxAge: 600 },
  async handler() {
    return listTeam(false);
  },
});
