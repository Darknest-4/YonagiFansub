import { defineRoute } from '@/shared/api/handler';
import { contactQuerySchema } from '@/lib/validation/schemas';
import { db } from '@/infrastructure/db';
import { paginationMeta, toSkipTake } from '@/shared/api/pagination';
import type { Prisma } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  auth: 'contact:read',
  rateLimit: 'api:read',
  query: contactQuerySchema,
  async handler({ query }) {
    const where: Prisma.ContactMessageWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.category) where.category = query.category;
    if (query.q) {
      where.OR = [
        { subject: { contains: query.q, mode: 'insensitive' } },
        { name: { contains: query.q, mode: 'insensitive' } },
        { email: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const pagination = { page: query.page, perPage: query.perPage };

    const [items, total] = await Promise.all([
      db.contactMessage.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          subject: true,
          body: true,
          category: true,
          status: true,
          internalNote: true,
          createdAt: true,
          handledAt: true,
          handledBy: { select: { username: true, displayName: true } },
        },
        // New first, then oldest-unanswered — the queue order the team works in.
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        ...toSkipTake(pagination),
      }),
      db.contactMessage.count({ where }),
    ]);

    return { items, meta: paginationMeta(total, pagination) };
  },
  meta: (result) => result.meta,
});
