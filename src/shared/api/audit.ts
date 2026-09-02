import 'server-only';
import type { AuditAction, Prisma } from '@prisma/client';
import { db } from '@/infrastructure/db';
import { paginationMeta, toSkipTake, type PaginationInput } from '@/shared/api/pagination';
import { logger, redact } from '@/infrastructure/logger';

/**
 * Audit trail.
 *
 * Append-only record of every state change made through the admin surface. Two
 * design rules:
 *   1. The actor label is denormalised, so the trail survives account deletion.
 *   2. Writing an audit entry must never fail the operation it describes — a
 *      logging outage is not a reason to reject a legitimate edit. Failures are
 *      escalated to the error log instead.
 */

export interface AuditInput {
  actorId?: string | null;
  actorLabel?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  summary: string;
  before?: unknown;
  after?: unknown;
  ipHash?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

/** Fields that are never worth storing in a diff, and must never be stored at all. */
const IGNORED_DIFF_KEYS = new Set([
  'updatedAt',
  'createdAt',
  'passwordHash',
  'tokenHash',
  'viewCount',
  'downloadCount',
]);

/**
 * Shallow diff of two records, keeping only the fields that actually changed.
 * Storing whole snapshots would bloat the table and bury the signal.
 */
export function buildDiff(
  before: unknown,
  after: unknown,
): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
  if (typeof before !== 'object' || typeof after !== 'object' || !before || !after) {
    if (before === undefined && after === undefined) return null;
    return {
      before: (redact(before) ?? {}) as Record<string, unknown>,
      after: (redact(after) ?? {}) as Record<string, unknown>,
    };
  }

  const beforeRecord = before as Record<string, unknown>;
  const afterRecord = after as Record<string, unknown>;
  const changedBefore: Record<string, unknown> = {};
  const changedAfter: Record<string, unknown> = {};

  for (const key of new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)])) {
    if (IGNORED_DIFF_KEYS.has(key)) continue;

    const previous = beforeRecord[key];
    const next = afterRecord[key];
    if (JSON.stringify(previous ?? null) === JSON.stringify(next ?? null)) continue;

    changedBefore[key] = previous ?? null;
    changedAfter[key] = next ?? null;
  }

  if (Object.keys(changedAfter).length === 0) return null;

  return {
    before: redact(changedBefore) as Record<string, unknown>,
    after: redact(changedAfter) as Record<string, unknown>,
  };
}

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    const diff =
      input.before !== undefined || input.after !== undefined
        ? buildDiff(input.before, input.after)
        : null;

    await db.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        actorLabel: input.actorLabel ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        summary: input.summary.slice(0, 500),
        diff: (diff as Prisma.InputJsonValue) ?? undefined,
        ipHash: input.ipHash ?? null,
        userAgent: input.userAgent?.slice(0, 400) ?? null,
        requestId: input.requestId ?? null,
      },
    });
  } catch (error) {
    logger.error('Failed to write audit log entry', error, {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? undefined,
    });
  }
}

/** Retention: the runbook schedules this monthly. */
export async function pruneAuditLogs(retentionDays = 365): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
  const result = await db.auditLog.deleteMany({
    where: {
      createdAt: { lt: cutoff },
      // Security-relevant actions are kept for the full legal window.
      action: { notIn: ['LOGIN_FAILED', 'PERMISSION_CHANGE', 'DELETE'] },
    },
  });
  return result.count;
}

export interface AuditFilters {
  action?: AuditAction;
  entityType?: string;
  entityId?: string;
  actorId?: string;
}

/**
 * A napló olvasása.
 *
 * Az írás mellett van, mert a kettő egy dolog két fele: ami ide kerül, azt itt
 * is kell tudni előkeresni, és ha az egyik oldal mezőt vált, a másik nem
 * maradhat le. Írási végpont ehhez a táblához az egész alkalmazásban nincs a
 * `recordAudit`-on kívül.
 */
export async function listAuditEntries(filters: AuditFilters, pagination: PaginationInput) {
  const where: Prisma.AuditLogWhereInput = {};
  if (filters.action) where.action = filters.action;
  if (filters.entityType) where.entityType = filters.entityType;
  if (filters.entityId) where.entityId = filters.entityId;
  if (filters.actorId) where.actorId = filters.actorId;

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
}
