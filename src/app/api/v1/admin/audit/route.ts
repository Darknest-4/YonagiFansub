import { z } from 'zod';
import { AuditAction } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { defineRoute } from '@/shared/api/handler';
import { db } from '@/infrastructure/db';
import { paginationMeta, paginationSchema, toSkipTake } from '@/shared/api/pagination';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Audit trail viewer. Read-only by construction: there is no write endpoint for
 * this table anywhere in the application.
 */
export const GET = defineRoute({
  auth: 'audit:read',
  rateLimit: 'api:read',
  query: paginationSchema.extend({
    action: z.nativeEnum(AuditAction).optional(),
    entityType: z.string().max(40).optional(),
    entityId: z.string().max(40).optional(),
    actorId: z.string().cuid().optional(),
  }),
  async handler({ query }) {
    const where: Prisma.AuditLogWhereInput = {};
    if (query.action) where.action = query.action;
    if (query.entityType) where.entityType = query.entityType;
    if (query.entityId) where.entityId = query.entityId;
    if (query.actorId) where.actorId = query.actorId;

    const pagination = { page: query.page, perPage: query.perPage };

    const [items, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          summary: true,
          diff: true,
          actorLabel: true,
          createdAt: true,
          actor: { select: { username: true, displayName: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(pagination),
      }),
      db.auditLog.count({ where }),
    ]);

    return { items, meta: paginationMeta(total, pagination) };
  },
  meta: (result) => result.meta,
});
