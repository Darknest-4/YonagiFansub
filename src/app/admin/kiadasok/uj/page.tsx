import type { Metadata } from 'next';
import { ensurePermission } from '@/lib/auth/guards';
import { db } from '@/lib/db';
import { listReleaseFormats, listStorageHosts } from '@/server/releases';
import { ReleaseEditor } from '@/components/admin/release-editor';
import { EMPTY_RELEASE } from '@/lib/forms/defaults';

export const metadata: Metadata = { title: 'Új kiadás' };
export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ projekt?: string }>;

export default async function NewReleasePage({ searchParams }: { searchParams: SearchParams }) {
  await ensurePermission('release:write', '/admin/kiadasok/uj');
  const { projekt } = await searchParams;

  const [projects, formats, hosts] = await Promise.all([
    db.project.findMany({
      where: { deletedAt: null },
      orderBy: { title: 'asc' },
      select: { id: true, title: true },
    }),
    listReleaseFormats(),
    listStorageHosts(),
  ]);

  // Pre-selecting the project makes "add a release" from a project page one step.
  const preselected = projekt && projects.some((project) => project.id === projekt) ? projekt : '';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl">Új kiadás</h1>
        <p className="mt-1 text-sm text-content-muted">
          Piszkozatként jön létre; publikáláskor a követők értesítést kapnak.
        </p>
      </header>

      <ReleaseEditor
        initial={{ ...EMPTY_RELEASE, projectId: preselected }}
        projects={projects}
        initialEpisodes={[]}
        formats={formats}
        hosts={hosts}
        canDelete={false}
      />
    </div>
  );
}
