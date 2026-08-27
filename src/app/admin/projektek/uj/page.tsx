import type { Metadata } from 'next';
import { ensurePermission } from '@/lib/auth/guards';
import { listGenres } from '@/server/projects';
import { ProjectForm } from '@/components/admin/project-form';
import { EMPTY_PROJECT } from '@/lib/forms/defaults';

export const metadata: Metadata = { title: 'Új projekt' };
export const dynamic = 'force-dynamic';

export default async function NewProjectPage() {
  await ensurePermission('project:write', '/admin/projektek/uj');
  const genres = await listGenres();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl">Új projekt</h1>
        <p className="mt-1 text-sm text-content-muted">
          Piszkozatként jön létre — akkor lesz látható, amikor publikálod.
        </p>
      </header>

      <ProjectForm
        initial={EMPTY_PROJECT}
        genres={genres.map((genre) => ({ id: genre.id, name: genre.name }))}
        canDelete={false}
      />
    </div>
  );
}
