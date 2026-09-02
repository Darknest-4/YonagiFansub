import { z } from 'zod';
import { CommentStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { defineRoute } from '@/shared/api/handler';
import { db } from '@/infrastructure/db';
import { paginationMeta, paginationSchema, toSkipTake } from '@/shared/api/pagination';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  auth: 'comment:moderate',
  rateLimit: 'api:read',
  query: paginationSchema.extend({
    status: z.nativeEnum(CommentStatus).optional(),
    q: z.string().trim().max(120).optional(),
  }),
  async handler({ query }) {
    const where: Prisma.CommentWhereInput = { deletedAt: null };
    if (query.status) where.status = query.status;
    if (query.q) where.body = { contains: query.q, mode: 'insensitive' };

    const pagination = { page: query.page, perPage: query.perPage };

    const [items, total] = await Promise.all([
      db.comment.findMany({
        where,
        select: {
          id: true,
          body: true,
          status: true,
          createdAt: true,
          user: { select: { username: true, displayName: true, avatarUrl: true } },
          project: { select: { slug: true, title: true } },
          episode: { select: { number: true, project: { select: { slug: true, title: true } } } },
          newsPost: { select: { slug: true, title: true } },
        },
        // Pending first, then newest: the moderation queue's natural order.
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        ...toSkipTake(pagination),
      }),
      db.comment.count({ where }),
    ]);

    return { items, meta: paginationMeta(total, pagination) };
  },
  meta: (result) => result.meta,
});
