import 'server-only';
import type { AuditAction } from '@prisma/client';
import { recordAudit } from '@/lib/api/audit';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Shared plumbing for every admin mutation.
 *
 * Each write goes through `MutationContext.audit(...)`, which stamps the actor,
 * the request id and the client fingerprint onto the trail. Threading a context
 * object rather than five loose parameters is what keeps the service signatures
 * readable — and it makes "did we audit this?" answerable by looking at one call
 * per function instead of hunting for a `recordAudit` import.
 */

export interface MutationContext {
  actor: SessionUser;
  ipHash: string | null;
  userAgent: string | null;
  requestId: string;
  audit(input: {
    action: AuditAction;
    entityType: string;
    entityId?: string | null;
    summary: string;
    before?: unknown;
    after?: unknown;
  }): Promise<void>;
}

export function mutationContext(
  actor: SessionUser,
  meta: { ipHash: string | null; userAgent: string | null; requestId: string },
): MutationContext {
  return {
    actor,
    ...meta,
    async audit(input) {
      await recordAudit({
        actorId: actor.id,
        actorLabel: `${actor.displayName} (@${actor.username})`,
        ipHash: meta.ipHash,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
        ...input,
      });
    },
  };
}

/**
 * Normalises the "nullable optional" pattern that every write schema produces.
 *
 * Zod gives `undefined` for an omitted field and `null` for an explicitly
 * cleared one. Prisma treats `undefined` as "leave alone" and `null` as "set to
 * null" — which is exactly right, but only if the two are never conflated on
 * the way in. This helper makes that conversion explicit at each call site.
 */
export function nullable<T>(value: T | null | undefined): T | null {
  return value ?? null;
}
