import 'server-only';
import { Prisma, type PublishStatus } from '@prisma/client';
import { db } from '@/infrastructure/db';
import { ConflictError, NotFoundError } from '@/shared/lib/errors';
import { invalidateNews } from '@/infrastructure/cache';
import { logger } from '@/infrastructure/logger';
import { notifyNewsPost } from '@/features/notifications/service';
import { readingMinutes, stripMarkdown, truncate } from '@/shared/lib/utils';
import type { NewsWriteInput } from '@/lib/validation/schemas';
import { assertPublishAllowed, nullable, type MutationContext } from '@/shared/api/mutation-context';

/**
 * News writes.
 *
 * Two derived fields are computed here rather than asked of the author:
 * `readingMinutes` and, when left blank, `excerpt`. Both are mechanical, both
 * are always needed by the card component, and neither is something a writer
 * should have to maintain by hand every time they edit a paragraph.
 */

const adminNewsArgs = Prisma.validator<Prisma.NewsPostDefaultArgs>()({
  select: {
    id: true,
    slug: true,
    title: true,
    excerpt: true,
    content: true,
    coverImageUrl: true,
    categoryId: true,
    status: true,
    publishedAt: true,
    isPinned: true,
    viewCount: true,
    readingMinutes: true,
    createdAt: true,
    updatedAt: true,
    deletedAt: true,
    category: { select: { id: true, name: true, slug: true, color: true } },
    author: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
  },
});

export type AdminNewsPost = Prisma.NewsPostGetPayload<typeof adminNewsArgs>;

export async function getAdminNews(id: string): Promise<AdminNewsPost> {
  const post = await db.newsPost.findFirst({ where: { id }, ...adminNewsArgs });
  if (!post) throw new NotFoundError('A hír');
  return post;
}

function toNewsData(input: NewsWriteInput) {
  return {
    slug: input.slug,
    title: input.title,
    excerpt: input.excerpt ?? truncate(stripMarkdown(input.content), 280),
    content: input.content,
    coverImageUrl: nullable(input.coverImageUrl),
    categoryId: nullable(input.categoryId),
    status: input.status,
    isPinned: input.isPinned,
    readingMinutes: readingMinutes(input.content),
  };
}

function resolvePublishedAt(
  input: NewsWriteInput,
  current?: { publishedAt: Date | null },
): Date | null {
  if (input.publishedAt) return input.publishedAt;
  if (input.status === 'PUBLISHED') return current?.publishedAt ?? new Date();
  return current?.publishedAt ?? null;
}

/**
 * Announces a post, if it just became public.
 *
 * Fire-and-forget: an announcement is a side effect of publishing, and a mail
 * server having a bad minute must not fail the editor's save. `notifyNewsPost`
 * is idempotent — it claims the post before writing anything — so calling it on
 * every save of an already-published post is free.
 */
function announce(postId: string, status: PublishStatus): void {
  if (status !== 'PUBLISHED') return;

  void notifyNewsPost(postId).catch((error) =>
    logger.error('Hírértesítés kiküldése nem sikerült', error, { postId }),
  );
}

export async function createNews(
  input: NewsWriteInput,
  context: MutationContext,
): Promise<AdminNewsPost> {
  assertPublishAllowed(context, 'news:publish', input.status);

  const existing = await db.newsPost.findUnique({
    where: { slug: input.slug },
    select: { id: true },
  });
  if (existing) throw new ConflictError('Ez a slug már foglalt.');

  const post = await db.newsPost.create({
    data: {
      ...toNewsData(input),
      publishedAt: resolvePublishedAt(input),
      authorId: context.actor.id,
    },
    ...adminNewsArgs,
  });

  invalidateNews(post.slug);
  announce(post.id, input.status);

  await context.audit({
    action: 'CREATE',
    entityType: 'NewsPost',
    entityId: post.id,
    summary: `Hír létrehozva: ${post.title}`,
    after: { title: input.title, status: input.status },
  });

  return post;
}

export async function updateNews(
  id: string,
  input: NewsWriteInput,
  context: MutationContext,
): Promise<AdminNewsPost> {
  const current = await getAdminNews(id);
  assertPublishAllowed(context, 'news:publish', input.status, current.status);

  if (input.slug !== current.slug) {
    const clash = await db.newsPost.findUnique({
      where: { slug: input.slug },
      select: { id: true },
    });
    if (clash) throw new ConflictError('Ez a slug már foglalt.');
  }

  const post = await db.newsPost.update({
    where: { id },
    data: { ...toNewsData(input), publishedAt: resolvePublishedAt(input, current) },
    ...adminNewsArgs,
  });

  invalidateNews(current.slug);
  invalidateNews(post.slug);
  announce(post.id, input.status);

  await context.audit({
    action: 'UPDATE',
    entityType: 'NewsPost',
    entityId: id,
    summary: `Hír módosítva: ${post.title}`,
    before: { title: current.title, status: current.status, isPinned: current.isPinned },
    after: { title: input.title, status: input.status, isPinned: input.isPinned },
  });

  return post;
}

export async function softDeleteNews(id: string, context: MutationContext): Promise<void> {
  const post = await getAdminNews(id);

  await db.newsPost.update({
    where: { id },
    data: { deletedAt: new Date(), status: 'ARCHIVED', isPinned: false },
  });

  invalidateNews(post.slug);

  await context.audit({
    action: 'DELETE',
    entityType: 'NewsPost',
    entityId: id,
    summary: `Hír törölve: ${post.title}`,
  });
}
