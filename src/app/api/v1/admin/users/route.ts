import { defineRoute } from '@/shared/api/handler';
import { userQuerySchema } from '@/features/users/schemas';
import { listUsers } from '@/features/users/admin-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  auth: 'user:read',
  rateLimit: 'api:read',
  query: userQuerySchema,
  async handler({ query }) {
    return listUsers(
      { q: query.q, status: query.status, role: query.role, sort: query.sort },
      { page: query.page, perPage: query.perPage },
    );
  },
  meta: (result) => result.meta,
});
