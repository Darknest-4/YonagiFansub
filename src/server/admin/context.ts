import 'server-only';
import type { AuditAction } from '@prisma/client';
import { recordAudit } from '@/lib/api/audit';
import { ForbiddenError } from '@/lib/errors';
import { hasPermission, type Permission } from '@/lib/auth/permissions';
import { toActor, type SessionUser } from '@/lib/auth/session';

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

/**
 * Guards a change of publish state.
 *
 * `project:publish`, `release:publish` and `news:publish` exist so a role can be
 * allowed to prepare content without being allowed to put it in front of the
 * public — that is the whole difference between the `staff` and `editor` roles.
 * Enforcing that only on a dedicated "publish" endpoint would be enforcing
 * nothing: the ordinary edit form carries a status field, so a staff member
 * could publish by choosing PUBLISHED in the dropdown and saving. The check
 * therefore lives on the write path itself, where the status actually changes.
 *
 * Both directions are gated. Taking a published page down is a publishing
 * decision too — arguably the more disruptive one, since links to it already
 * exist. Everything that never touches PUBLISHED (draft → archived and back,
 * or editing a published page without changing its status) stays a plain write.
 */
export function assertPublishAllowed(
  context: MutationContext,
  permission: Permission,
  next: string,
  current?: string | null,
): void {
  if (next === current) return;
  if (next !== 'PUBLISHED' && current !== 'PUBLISHED') return;
  if (hasPermission(toActor(context.actor), permission)) return;

  throw new ForbiddenError(
    current === 'PUBLISHED'
      ? 'Nincs jogosultságod publikált tartalom visszavonásához.'
      : 'Nincs jogosultságod a publikáláshoz. Mentsd piszkozatként.',
  );
}
