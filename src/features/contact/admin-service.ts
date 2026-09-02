import 'server-only';
import type { ContactCategory, ContactStatus, Prisma } from '@prisma/client';
import { db } from '@/infrastructure/db';
import { NotFoundError } from '@/shared/lib/errors';
import { paginationMeta, toSkipTake, type PaginationInput } from '@/shared/api/pagination';
import type { MutationContext } from '@/shared/api/mutation-context';

/**
 * A beérkezett üzenetek kezelése.
 *
 * Az űrlap beküldése (`service.ts`) és az üzenetek intézése két különböző
 * dolog, két különböző jogosultsággal — ezért van két fájl ugyanabban a
 * feature-ben.
 */

export interface ContactListFilters {
  status?: ContactStatus;
  category?: ContactCategory;
  q?: string;
}

export async function listContactMessages(
  filters: ContactListFilters,
  pagination: PaginationInput,
) {
  const where: Prisma.ContactMessageWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.category) where.category = filters.category;
  if (filters.q) {
    where.OR = [
      { subject: { contains: filters.q, mode: 'insensitive' } },
      { name: { contains: filters.q, mode: 'insensitive' } },
      { email: { contains: filters.q, mode: 'insensitive' } },
    ];
  }

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
}

export interface ContactUpdate {
  status: ContactStatus;
  internalNote?: string | null | undefined;
}

export async function updateContactMessage(
  messageId: string,
  update: ContactUpdate,
  context: MutationContext,
) {
  const current = await db.contactMessage.findUnique({
    where: { id: messageId },
    select: { id: true, subject: true, status: true },
  });
  if (!current) throw new NotFoundError('Az üzenet');

  const message = await db.contactMessage.update({
    where: { id: messageId },
    data: {
      status: update.status,
      internalNote: update.internalNote,
      // Stamp the handler on the first non-NEW transition, and keep it after.
      handledById: update.status === 'NEW' ? null : context.actor.id,
      handledAt: update.status === 'NEW' ? null : new Date(),
    },
    select: { id: true, status: true, handledAt: true },
  });

  await context.audit({
    action: 'UPDATE',
    entityType: 'ContactMessage',
    entityId: messageId,
    summary: `Üzenet státusza: ${current.status} → ${update.status} (${current.subject})`,
  });

  return message;
}

/**
 * A lezárt üzenetek elévülése.
 *
 * Csak az archivált és a spamnek jelölt sorok tűnnek el: egy nyitott ügyet
 * évek múlva sem szabad csendben eldobni, egy lezártat viszont fölösleges
 * személyes adattal együtt őrizni.
 */
export async function pruneContactMessages(retentionDays: number): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
  const { count } = await db.contactMessage.deleteMany({
    where: { createdAt: { lt: cutoff }, status: { in: ['ARCHIVED', 'SPAM'] } },
  });
  return count;
}
