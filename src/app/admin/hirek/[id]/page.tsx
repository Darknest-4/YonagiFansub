import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ensurePermission } from '@/lib/auth/guards';
import { hasPermission } from '@/lib/auth/permissions';
import { toActor } from '@/lib/auth/session';
import { isAppError } from '@/lib/errors';
import { getAdminNews } from '@/server/admin/news';
import { listNewsCategories } from '@/server/news';
import { NewsForm } from '@/components/admin/news-form';
import { toLocalDateTimeValue, type NewsFormValues } from '@/lib/forms/defaults';

export const metadata: Metadata = { title: 'Hír szerkesztése' };
export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export default async function EditNewsPage({ params }: { params: Params }) {
  const { id } = await params;
  const user = await ensurePermission('news:write', `/admin/hirek/${id}`);

  const post = await getAdminNews(id).catch((error) => {
    if (isAppError(error) && error.code === 'NOT_FOUND') notFound();
    throw error;
  });

  const categories = await listNewsCategories();

  const initial: NewsFormValues = {
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt ?? '',
    content: post.content,
    coverImageUrl: post.coverImageUrl ?? '',
    categoryId: post.categoryId ?? '',
    status: post.status,
    publishedAt: toLocalDateTimeValue(post.publishedAt),
    isPinned: post.isPinned,
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="truncate text-2xl">{post.title}</h1>
        <p className="nums mt-1 text-sm text-content-muted">
          {post.viewCount} megtekintés · {post.readingMinutes} perc olvasás
        </p>
      </header>

      <NewsForm
        postId={post.id}
        initial={initial}
        categories={categories.map((category) => ({ id: category.id, name: category.name }))}
        canDelete={hasPermission(toActor(user), 'news:delete')}
        canPublish={hasPermission(toActor(user), 'news:publish')}
      />
    </div>
  );
}
