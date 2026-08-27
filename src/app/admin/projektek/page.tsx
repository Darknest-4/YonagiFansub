import type { Metadata } from 'next';
import { Plus } from 'lucide-react';
import { ensurePermission } from '@/lib/auth/guards';
import { listProjects } from '@/server/projects';
import { paginationSchema, parseList } from '@/lib/api/pagination';
import { projectQuerySchema } from '@/lib/validation/schemas';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/feedback';
import { AdminProjectTable } from '@/components/admin/project-table';

export const metadata: Metadata = { title: 'Projektek' };
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminProjectsPage({ searchParams }: { searchParams: SearchParams }) {
  await ensurePermission('project:read', '/admin/projektek');

  const raw = await searchParams;
  const flat = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );

  const parsed = projectQuerySchema.safeParse(flat);
  const filters = parsed.success ? parsed.data : projectQuerySchema.parse({});
  const pagination = paginationSchema.parse({ page: filters.page, perPage: 25 });

  const { items, meta } = await listProjects(
    {
      q: filters.q,
      status: filters.status,
      type: filters.type,
      genres: parseList(filters.genre),
      sort: filters.sort,
      includeUnpublished: true,
    },
    pagination,
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl">Projektek</h1>
          <p className="mt-1 text-sm text-content-muted">
            Sorozatok és filmek, a piszkozatokkal együtt.
          </p>
        </div>

        <ButtonLink
          href="/admin/projektek/uj"
          variant="primary"
          size="md"
          leadingIcon={<Plus className="size-4" aria-hidden />}
        >
          Új projekt
        </ButtonLink>
      </header>

      <AdminProjectTable
        rows={items.map((project) => ({
          id: project.id,
          slug: project.slug,
          title: project.title,
          titleNative: project.titleNative,
          coverImageUrl: project.coverImageUrl,
          type: project.type,
          status: project.status,
          episodeCount: project._count.episodes,
          totalEpisodes: project.totalEpisodes,
          updatedAt: project.updatedAt.toISOString(),
        }))}
        meta={meta}
        emptyState={
          <EmptyState
            title="Nincs találat"
            description="Módosítsd a szűrőket, vagy hozz létre egy új projektet."
            action={{ label: 'Új projekt', href: '/admin/projektek/uj' }}
            compact
          />
        }
      />
    </div>
  );
}
