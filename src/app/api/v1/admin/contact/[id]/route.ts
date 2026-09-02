import { defineRoute, idParams } from '@/shared/api/handler';
import { contactUpdateSchema } from '@/features/contact/schemas';
import { updateContactMessage } from '@/features/contact/admin-service';
import { mutationContext } from '@/shared/api/mutation-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PATCH = defineRoute({
  auth: 'contact:write',
  rateLimit: 'admin:write',
  params: idParams,
  body: contactUpdateSchema,
  handler: ({ params, body, user, ipHash, userAgent, requestId }) =>
    updateContactMessage(params.id, body, mutationContext(user!, { ipHash, userAgent, requestId })),
});
