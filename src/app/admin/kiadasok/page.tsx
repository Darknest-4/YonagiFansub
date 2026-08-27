import type { Metadata } from 'next';
import { Plus } from 'lucide-react';
import { ensurePermission } from '@/lib/auth/guards';
import { hasPermission } from '@/lib/auth/permissions';
import { toActor } from '@/lib/auth/session';
import { listReleases } from '@/server/releases';
import { paginationSchema } from '@/lib/api/pagination';
import { releaseQuerySchema } from '@/lib/validation/schemas';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/feedback';
import { AdminReleaseTable } from '@/components/admin/release-table';

export const metadata: Metadata = { title: 'Kiadások' };
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminReleasesPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await ensurePermission('release:write', '/admin/kiadasok');

  const raw = await searchParams;
  const flat = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );

  const parsed = releaseQuerySchema.safeParse(flat);
  const filters = parsed.success ? parsed.data : releaseQuerySchema.parse({});
  const pagination = paginationSchema.parse({ page: filters.page, perPage: 25 });

  const { items, meta } = await listReleases(
    {
      projectId: filters.projectId,
      resolution: filters.resolution,
      kind: filters.kind,
      status: filters.status,
      sort: filters.sort,
      includeUnpublished: true,
    },
    pagination,
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl">Kiadások</h1>
          <p className="mt-1 text-sm text-content-muted">
            Epizódok, batch-ek és javított verziók a letöltési linkjeikkel.
          </p>
        </div>

        <ButtonLink
          href="/admin/kiadasok/uj"
          variant="primary"
          size="md"
          leadingIcon={<Plus className="size-4" aria-hidden />}
        >
          Új kiadás
        </ButtonLink>
      </header>

      <AdminReleaseTable
        canPublish={hasPermission(toActor(user), 'release:publish')}
        rows={items.map((release) => ({
          id: release.id,
          projectTitle: release.project.title,
          projectSlug: release.project.slug,
          coverImageUrl: release.project.coverImageUrl,
          episodeNumber: release.episode ? Number(release.episode.number) : null,
          kind: release.kind,
          version: release.version,
          resolution: release.resolution,
          status: release.status,
          fileSizeBytes: release.fileSizeBytes?.toString() ?? null,
          releasedAt: release.releasedAt?.toISOString() ?? null,
          downloadCount: release.downloadCount,
          linkCount: release._count.links,
        }))}
        meta={meta}
        emptyState={
          <EmptyState
            title="Nincs kiadás"
            description="Vedd fel az első kiadást, hogy a látogatók le tudják tölteni."
            action={{ label: 'Új kiadás', href: '/admin/kiadasok/uj' }}
            compact
          />
        }
      />
    </div>
  );
}
