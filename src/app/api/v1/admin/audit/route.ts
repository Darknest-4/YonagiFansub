import { z } from 'zod';
import { AuditAction } from '@prisma/client';
import { defineRoute } from '@/shared/api/handler';
import { listAuditEntries } from '@/shared/api/audit';
import { paginationSchema } from '@/shared/api/pagination';

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
  handler: ({ query }) => listAuditEntries(query, { page: query.page, perPage: query.perPage }),
  meta: (result) => result.meta,
});
