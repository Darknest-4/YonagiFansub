import { defineRoute } from '@/lib/api/handler';
import { listGenres } from '@/server/projects';

// Rendered per request: the response depends on the database, which is not
// reachable during `next build`. See `(site)/layout.tsx` for the full reasoning.
export const dynamic = 'force-dynamic';

export const runtime = 'nodejs';

export const GET = defineRoute({
  auth: 'public',
  rateLimit: 'api:read',
  cache: { sMaxAge: 3600 },
  async handler() {
    return listGenres();
  },
});
