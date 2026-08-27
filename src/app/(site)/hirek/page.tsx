import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { Newspaper } from 'lucide-react';
import { PageHeader } from '@/components/site/page-header';
import { NewsCard } from '@/components/site/news-card';
import { EmptyState, Skeleton } from '@/components/ui/feedback';
import { Pagination } from '@/components/ui/pagination';
import { listNews, listNewsCategories } from '@/server/news';
import { paginationSchema } from '@/lib/api/pagination';
import { newsQuerySchema } from '@/lib/validation/schemas';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Hírek',
  description:
    'Bejelentések, projektindítások és csapathírek a Yonagi Fansubtól.',
  alternates: {
    canonical: '/hirek',
    types: { 'application/rss+xml': '/rss.xml' },
  },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function NewsPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const flat = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );

  const parsed = newsQuerySchema.safeParse(flat);
  const filters = parsed.success ? parsed.data : newsQuerySchema.parse({});
  const pagination = paginationSchema.parse({ page: filters.page, perPage: 12 });

  const categories = await listNewsCategories();

  return (
    <div className="container-content py-10 lg:py-14">
      <PageHeader
        eyebrow="Hírek"
        title="Bejelentések és csapathírek"
        description="Új projektek, kiadási tervek, technikai bejegyzések és minden más, amit érdemes tudni rólunk."
      />

      {categories.length > 0 && (
        <nav aria-label="Hírkategóriák" className="mt-8">
          <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <li>
              <CategoryPill href="/hirek" active={!filters.category} label="Összes" />
            </li>
            {categories.map((category) => (
              <li key={category.slug}>
                <CategoryPill
                  href={`/hirek?category=${category.slug}`}
                  active={filters.category === category.slug}
                  label={category.name}
                  count={category._count.posts}
                  color={category.color}
                />
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div className="mt-8">
        <Suspense key={JSON.stringify(flat)} fallback={<NewsGridSkeleton />}>
          <NewsResults
            category={filters.category}
            q={filters.q}
            page={pagination.page}
            perPage={pagination.perPage}
          />
        </Suspense>
      </div>
    </div>
  );
}

async function NewsResults({
  category,
  q,
  page,
  perPage,
}: {
  category?: string;
  q?: string;
  page: number;
  perPage: number;
}) {
  const { items, meta } = await listNews(
    { category, q, includeUnpublished: false },
    { page, perPage },
  );

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Newspaper className="size-6" aria-hidden />}
        title="Még nincs itt hír"
        description="Ebben a kategóriában még nem jelent meg bejegyzés. Nézd meg a többi kategóriát."
        action={{ label: 'Összes hír', href: '/hirek' }}
      />
    );
  }

  // The lead story gets the wide treatment, but only on the first page —
  // on page three there is nothing "lead" about the fourth-newest post.
  const featureLead = page === 1 && !q;
  const [lead, ...rest] = items;

  const buildHref = (targetPage: number) => {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (q) params.set('q', q);
    if (targetPage > 1) params.set('page', String(targetPage));
    return `/hirek${params.toString() ? `?${params}` : ''}`;
  };

  return (
    <>
      {featureLead && lead && <NewsCard post={lead} featured priority className="mb-6" />}

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {(featureLead ? rest : items).map((post, index) => (
          <NewsCard key={post.id} post={post} priority={!featureLead && index < 3} />
        ))}
      </div>

      <Pagination
        page={meta.page ?? 1}
        totalPages={meta.totalPages ?? 1}
        total={meta.total}
        perPage={meta.perPage}
        buildHref={buildHref}
        className="mt-12"
      />
    </>
  );
}

function CategoryPill({
  href,
  active,
  label,
  count,
  color,
}: {
  href: string;
  active: boolean;
  label: string;
  count?: number;
  color?: string | null;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-2xs font-medium whitespace-nowrap',
        'transition-[background-color,border-color,color] duration-fast',
        active
          ? 'border-tide-400/40 bg-tide-400/12 text-tide-200'
          : 'border-ink-700 bg-ink-900/60 text-mist-400 hover:border-ink-600 hover:text-mist-200',
      )}
      style={active && color ? { borderColor: `${color}66`, color } : undefined}
    >
      {label}
      {count !== undefined && count > 0 && <span className="nums text-mist-600">{count}</span>}
    </Link>
  );
}

function NewsGridSkeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="space-y-3">
          <Skeleton className="aspect-3/2 w-full rounded-xl" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}
