import { defineRoute } from '@/shared/api/handler';
import { teamMemberWriteSchema } from '@/features/team/schemas';
import { createTeamMember, listAdminTeam } from '@/features/team/admin-service';
import { mutationContext } from '@/shared/api/mutation-context';

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
