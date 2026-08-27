import { defineRoute } from '@/lib/api/handler';
import { faqWriteSchema } from '@/lib/validation/schemas';
import { mutationContext } from '@/server/admin/context';
import { createFaqEntry, listAdminFaq } from '@/server/admin/faq';

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
