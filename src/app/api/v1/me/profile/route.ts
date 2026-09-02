import { defineRoute } from '@/shared/api/handler';
import { updateProfileSchema } from '@/features/users/schemas';
import { updateOwnProfile } from '@/features/users/account-service';
import { mutationContext } from '@/shared/api/mutation-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Self-service profile update — display name, bio and avatar only. */
export const PATCH = defineRoute({
  auth: 'user',
  rateLimit: 'api:write',
  body: updateProfileSchema,
  handler: ({ body, user, ipHash, userAgent, requestId }) =>
    updateOwnProfile(body, mutationContext(user!, { ipHash, userAgent, requestId })),
});
