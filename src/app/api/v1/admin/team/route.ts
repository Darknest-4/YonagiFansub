import { defineRoute } from '@/lib/api/handler';
import { teamMemberWriteSchema } from '@/lib/validation/schemas';
import { createTeamMember, listAdminTeam } from '@/server/admin/team';
import { mutationContext } from '@/server/admin/context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  auth: 'team:write',
  rateLimit: 'api:read',
  async handler() {
    return listAdminTeam();
  },
});

export const POST = defineRoute({
  auth: 'team:write',
  rateLimit: 'admin:write',
  body: teamMemberWriteSchema,
  async handler({ body, user, ipHash, userAgent, requestId }) {
    return createTeamMember(body, mutationContext(user!, { ipHash, userAgent, requestId }));
  },
});
