import type { Metadata } from 'next';
import { ensurePermission } from '@/lib/auth/guards';
import { hasPermission } from '@/lib/auth/permissions';
import { toActor } from '@/lib/auth/session';
import { listNewsCategories } from '@/server/news';
import { NewsForm } from '@/components/admin/news-form';
import { EMPTY_NEWS } from '@/lib/forms/defaults';

export const metadata: Metadata = { title: 'Új hír' };
export const dynamic = 'force-dynamic';

export default async function NewNewsPage() {
  const user = await ensurePermission('news:write', '/admin/hirek/uj');
  const categories = await listNewsCategories();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl">Új hír</h1>
      </header>

      <NewsForm
        initial={EMPTY_NEWS}
        categories={categories.map((category) => ({ id: category.id, name: category.name }))}
        canDelete={false}
        canPublish={hasPermission(toActor(user), 'news:publish')}
      />
    </div>
  );
}
