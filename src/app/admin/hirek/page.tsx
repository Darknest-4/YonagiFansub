import type { Metadata } from 'next';
import Link from 'next/link';
import { Pin, Plus } from 'lucide-react';
import { ensurePermission } from '@/lib/auth/guards';
import { listNews } from '@/server/news';
import { paginationSchema } from '@/lib/api/pagination';
import { newsQuerySchema } from '@/lib/validation/schemas';
import { formatDate } from '@/lib/utils';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/feedback';

export const metadata: Metadata = { title: 'Hírek' };
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminNewsPage({ searchParams }: { searchParams: SearchParams }) {
  await ensurePermission('news:write', '/admin/hirek');

  const raw = await searchParams;
  const flat = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );

  const parsed = newsQuerySchema.safeParse(flat);
  const filters = parsed.success ? parsed.data : newsQuerySchema.parse({});
  const pagination = paginationSchema.parse({ page: filters.page, perPage: 25 });

  const { items } = await listNews(
    { q: filters.q, category: filters.category, status: filters.status, includeUnpublished: true },
    pagination,
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl">Hírek</h1>
          <p className="mt-1 text-sm text-content-muted">
            Bejelentések és csapathírek, a piszkozatokkal együtt.
          </p>
        </div>

        <ButtonLink
          href="/admin/hirek/uj"
          variant="primary"
          size="md"
          leadingIcon={<Plus className="size-4" aria-hidden />}
        >
          Új hír
        </ButtonLink>
      </header>

      {items.length === 0 ? (
        <EmptyState
          title="Nincs bejegyzés"
          description="Írd meg az elsőt — a hírek a főoldalon is megjelennek."
          action={{ label: 'Új hír', href: '/admin/hirek/uj' }}
        />
      ) : (
        <ul className="space-y-2.5">
          {items.map((post) => (
            <li key={post.id}>
              <Link
                href={`/admin/hirek/${post.id}`}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-ink-800 bg-ink-900/40 p-4 transition-colors hover:border-ink-600 hover:bg-ink-850"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {post.isPinned && (
                      <Pin className="size-3.5 shrink-0 text-ember-400" aria-label="Kiemelt" />
                    )}
                    <span className="truncate text-sm font-medium text-mist-100">
                      {post.title}
                    </span>
                    {post.category && (
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-2xs"
                        style={{
                          color: post.category.color ?? '#8f9bbd',
                          backgroundColor: `color-mix(in oklab, ${post.category.color ?? '#8f9bbd'} 12%, transparent)`,
                        }}
                      >
                        {post.category.name}
                      </span>
                    )}
                  </div>

                  <p className="nums mt-1 text-2xs text-mist-600">
                    {post.author?.displayName ?? 'Ismeretlen szerző'} ·{' '}
                    {post.publishedAt ? formatDate(post.publishedAt) : 'nincs dátum'} ·{' '}
                    {post.readingMinutes} perc · {post.viewCount} megtekintés
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
