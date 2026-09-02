import { defineRoute } from '@/shared/api/handler';
import { contactQuerySchema } from '@/features/contact/schemas';
import { listContactMessages } from '@/features/contact/admin-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  auth: 'contact:read',
  rateLimit: 'api:read',
  query: contactQuerySchema,
  handler: ({ query }) =>
    listContactMessages(query, { page: query.page, perPage: query.perPage }),
  meta: (result) => result.meta,
});
