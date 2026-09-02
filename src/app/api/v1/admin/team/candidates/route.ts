import { z } from 'zod';
import { defineRoute } from '@/shared/api/handler';
import { listTeamCandidates } from '@/features/team/admin-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Accounts available for a team profile, for the picker on /admin/csapat.
 *
 * Guarded by `team:write` rather than `user:read` on purpose: an editor manages
 * the roster but has no business reading the user administration list, and this
 * returns only what a picker needs to render a row — no email, role or status.
 */
export const GET = defineRoute({
  auth: 'team:write',
  rateLimit: 'api:read',
  query: z.object({
    q: z.string().trim().max(80).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  }),
  async handler({ query }) {
    return listTeamCandidates(query.q, query.limit);
  },
});
