import { defineRoute, idParams } from '@/lib/api/handler';
import { teamMemberWriteSchema } from '@/lib/validation/schemas';
import {
  getAdminTeamMember,
  softDeleteTeamMember,
  updateTeamMember,
} from '@/server/admin/team';
import { mutationContext } from '@/server/admin/context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  auth: 'team:write',
  rateLimit: 'api:read',
  params: idParams,
  async handler({ params }) {
    return getAdminTeamMember(params.id);
  },
});

export const PUT = defineRoute({
  auth: 'team:write',
  rateLimit: 'admin:write',
  params: idParams,
  body: teamMemberWriteSchema,
  async handler({ params, body, user, ipHash, userAgent, requestId }) {
    return updateTeamMember(
      params.id,
      body,
      mutationContext(user!, { ipHash, userAgent, requestId }),
    );
  },
});

export const DELETE = defineRoute({
  auth: 'team:delete',
  rateLimit: 'admin:write',
  params: idParams,
  async handler({ params, user, ipHash, userAgent, requestId }) {
    await softDeleteTeamMember(params.id, mutationContext(user!, { ipHash, userAgent, requestId }));
    return { deleted: true };
  },
});
