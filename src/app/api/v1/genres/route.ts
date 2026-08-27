import { defineRoute } from '@/lib/api/handler';
import { listGenres } from '@/server/projects';

export const runtime = 'nodejs';

export const GET = defineRoute({
  auth: 'public',
  rateLimit: 'api:read',
  cache: { sMaxAge: 3600 },
  async handler() {
    return listGenres();
  },
});
