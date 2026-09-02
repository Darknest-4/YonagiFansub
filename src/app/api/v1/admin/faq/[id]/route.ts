import { defineRoute, idParams } from '@/shared/api/handler';
import { faqWriteSchema } from '@/lib/validation/schemas';
import { mutationContext } from '@/shared/api/mutation-context';
import { deleteFaqEntry, getAdminFaqEntry, updateFaqEntry } from '@/features/faq/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  auth: 'faq:write',
  rateLimit: 'api:read',
  params: idParams,
  async handler({ params }) {
    return getAdminFaqEntry(params.id);
  },
});

export const PUT = defineRoute({
  auth: 'faq:write',
  rateLimit: 'admin:write',
  params: idParams,
  body: faqWriteSchema,
  async handler({ params, body, user, ipHash, userAgent, requestId }) {
    return updateFaqEntry(params.id, body, mutationContext(user!, { ipHash, userAgent, requestId }));
  },
});

export const DELETE = defineRoute({
  auth: 'faq:write',
  rateLimit: 'admin:write',
  params: idParams,
  async handler({ params, user, ipHash, userAgent, requestId }) {
    await deleteFaqEntry(params.id, mutationContext(user!, { ipHash, userAgent, requestId }));
    return { deleted: true };
  },
});
