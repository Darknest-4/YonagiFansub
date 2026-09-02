import 'server-only';
import { db } from '@/infrastructure/db';
import { CACHE_TAGS, invalidate } from '@/infrastructure/cache';
import { NotFoundError } from '@/shared/lib/errors';
import type { FaqWriteInput } from '@/features/faq/schemas';
import { nullable, type MutationContext } from '@/shared/api/mutation-context';

/**
 * FAQ writes.
 *
 * The smallest editable content type in the system, and the one most likely to
 * be edited by someone who is not a developer — which is exactly why it is
 * managed here rather than living in the seed. A question the team keeps
 * answering by hand belongs on `/gyik` the same afternoon, not in the next
 * deploy.
 *
 * There is no soft delete: an FAQ entry has no public URL of its own, nothing
 * references it, and `isPublished` already covers "take it down but keep it".
 */

export interface AdminFaqEntry {
  id: string;
  question: string;
  answer: string;
  category: string;
  sortOrder: number;
  isPublished: boolean;
  updatedAt: Date;
}

export async function listAdminFaq(): Promise<AdminFaqEntry[]> {
  return db.faqEntry.findMany({
    orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
    select: {
      id: true,
      question: true,
      answer: true,
      category: true,
      sortOrder: true,
      isPublished: true,
      updatedAt: true,
    },
  });
}

export async function getAdminFaqEntry(id: string): Promise<AdminFaqEntry> {
  const entry = await db.faqEntry.findUnique({
    where: { id },
    select: {
      id: true,
      question: true,
      answer: true,
      category: true,
      sortOrder: true,
      isPublished: true,
      updatedAt: true,
    },
  });

  if (!entry) throw new NotFoundError('A GYIK bejegyzés');
  return entry;
}

export async function createFaqEntry(
  input: FaqWriteInput,
  context: MutationContext,
): Promise<AdminFaqEntry> {
  // A new entry lands at the end of its category unless placed deliberately, so
  // adding one never silently reorders the list a visitor already knows.
  const sortOrder =
    input.sortOrder ??
    ((
      await db.faqEntry.aggregate({
        where: { category: input.category },
        _max: { sortOrder: true },
      })
    )._max.sortOrder ?? 0) + 10;

  const entry = await db.faqEntry.create({
    data: {
      question: input.question,
      answer: input.answer,
      category: input.category,
      sortOrder,
      isPublished: input.isPublished,
    },
    select: {
      id: true,
      question: true,
      answer: true,
      category: true,
      sortOrder: true,
      isPublished: true,
      updatedAt: true,
    },
  });

  invalidate(CACHE_TAGS.faq);

  await context.audit({
    action: 'CREATE',
    entityType: 'FaqEntry',
    entityId: entry.id,
    summary: `GYIK bejegyzés létrehozva: ${entry.question}`,
    after: { question: entry.question, category: entry.category, isPublished: entry.isPublished },
  });

  return entry;
}

export async function updateFaqEntry(
  id: string,
  input: FaqWriteInput,
  context: MutationContext,
): Promise<AdminFaqEntry> {
  const current = await getAdminFaqEntry(id);

  const entry = await db.faqEntry.update({
    where: { id },
    data: {
      question: input.question,
      answer: input.answer,
      category: input.category,
      sortOrder: nullable(input.sortOrder) ?? current.sortOrder,
      isPublished: input.isPublished,
    },
    select: {
      id: true,
      question: true,
      answer: true,
      category: true,
      sortOrder: true,
      isPublished: true,
      updatedAt: true,
    },
  });

  invalidate(CACHE_TAGS.faq);

  await context.audit({
    action: 'UPDATE',
    entityType: 'FaqEntry',
    entityId: id,
    summary: `GYIK bejegyzés módosítva: ${entry.question}`,
    before: {
      question: current.question,
      answer: current.answer,
      category: current.category,
      sortOrder: current.sortOrder,
      isPublished: current.isPublished,
    },
    after: {
      question: entry.question,
      answer: entry.answer,
      category: entry.category,
      sortOrder: entry.sortOrder,
      isPublished: entry.isPublished,
    },
  });

  return entry;
}

export async function deleteFaqEntry(id: string, context: MutationContext): Promise<void> {
  const entry = await getAdminFaqEntry(id);

  await db.faqEntry.delete({ where: { id } });
  invalidate(CACHE_TAGS.faq);

  await context.audit({
    action: 'DELETE',
    entityType: 'FaqEntry',
    entityId: id,
    summary: `GYIK bejegyzés törölve: ${entry.question}`,
    before: { question: entry.question, category: entry.category },
  });
}
