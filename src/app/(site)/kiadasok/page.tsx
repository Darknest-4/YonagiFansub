import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PackageOpen } from 'lucide-react';
import { PageHeader } from '@/components/site/page-header';
import { ReleaseRow } from '@/components/site/release-card';
import { EmptyState, ReleaseListSkeleton } from '@/components/ui/feedback';
import { Pagination } from '@/components/ui/pagination';
import { listPublicReleases } from '@/server/releases';
import { paginationSchema } from '@/lib/api/pagination';
import { releaseQuerySchema } from '@/lib/validation/schemas';
import { ReleaseFilters } from '@/components/site/release-filters';

export const metadata: Metadata = {
  title: 'Legújabb kiadások',
  description:
    'A Yonagi Fansub összes megjelent kiadása: epizódok, batch-ek és javított verziók, felbontás és formátum szerint szűrhetően.',
  alternates: { canonical: '/kiadasok' },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Release feed.
 *
 * The most-visited page after the home page: people arrive here to answer one
 * question — "is the new episode out?" — so the layout puts the newest release
 * at the top with nothing above it but the filter bar.
 */
export default async function ReleasesPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const flat = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );

  const parsed = releaseQuerySchema.safeParse(flat);
  const filters = parsed.success ? parsed.data : releaseQuerySchema.parse({});
  const pagination = paginationSchema.parse({ page: filters.page, perPage: 20 });

  return (
    <div className="container-content py-10 lg:py-14">
      <PageHeader
        eyebrow="Kiadások"
        title="Legújabb kiadások"
        description="Minden megjelent epizód, batch és javított verzió időrendben. A friss kiadásokat kiemeljük."
      />

      <div className="mt-8">
        <Suspense fallback={<div className="h-14" />}>
          <ReleaseFilters />
        </Suspense>
      </div>

      <div className="mt-6">
        <Suspense key={JSON.stringify(flat)} fallback={<ReleaseListSkeleton count={8} />}>
          <ReleaseResults filters={filters} page={pagination.page} perPage={pagination.perPage} />
        </Suspense>
      </div>
    </div>
  );
}

async function ReleaseResults({
  filters,
  page,
  perPage,
}: {
  filters: ReturnType<typeof releaseQuerySchema.parse>;
  page: number;
  perPage: number;
}) {
  const { items, meta } = await listPublicReleases(
    JSON.stringify({
      projectSlug: filters.projectSlug,
      resolution: filters.resolution,
      kind: filters.kind,
      sort: filters.sort,
    }),
    JSON.stringify({ page, perPage }),
  );

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<PackageOpen className="size-6" aria-hidden />}
        title="Nincs a szűrőknek megfelelő kiadás"
        description="Próbáld más felbontással vagy típussal, esetleg nézd meg a teljes listát."
        action={{ label: 'Összes kiadás', href: '/kiadasok' }}
      />
    );
  }

  const buildHref = (targetPage: number) => {
    const params = new URLSearchParams();
    if (filters.resolution) params.set('resolution', filters.resolution);
    if (filters.kind) params.set('kind', filters.kind);
    if (filters.projectSlug) params.set('projectSlug', filters.projectSlug);
    if (filters.sort) params.set('sort', filters.sort);
    if (targetPage > 1) params.set('page', String(targetPage));
    return `/kiadasok${params.toString() ? `?${params}` : ''}`;
  };

  return (
    <>
      <div className="grid gap-3 lg:grid-cols-2">
        {items.map((release) => (
          <ReleaseRow key={release.id} release={release} />
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
