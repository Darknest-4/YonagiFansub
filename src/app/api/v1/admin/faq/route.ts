import { defineRoute } from '@/shared/api/handler';
import { faqWriteSchema } from '@/lib/validation/schemas';
import { mutationContext } from '@/shared/api/mutation-context';
import { createFaqEntry, listAdminFaq } from '@/features/faq/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  auth: 'faq:write',
  rateLimit: 'api:read',
  async handler() {
    return listAdminFaq();
  },
});

export const POST = defineRoute({
  auth: 'faq:write',
  rateLimit: 'admin:write',
  body: faqWriteSchema,
  async handler({ body, user, ipHash, userAgent, requestId }) {
    return createFaqEntry(body, mutationContext(user!, { ipHash, userAgent, requestId }));
  },
});
