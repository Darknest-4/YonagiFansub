import { z } from 'zod';
import { CommentStatus } from '@prisma/client';
import { defineRoute } from '@/shared/api/handler';
import { listCommentsForModeration } from '@/features/comments/moderation-service';
import { paginationSchema } from '@/shared/api/pagination';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  auth: 'comment:moderate',
  rateLimit: 'api:read',
  query: paginationSchema.extend({
    status: z.nativeEnum(CommentStatus).optional(),
    q: z.string().trim().max(120).optional(),
  }),
  handler: ({ query }) =>
    listCommentsForModeration(query, { page: query.page, perPage: query.perPage }),
  meta: (result) => result.meta,
});
