import type { Metadata } from 'next';
import Link from 'next/link';
import { ensurePermission } from '@/shared/auth/guards';
import { AnimeImport } from '@/features/metadata/components/anime-import';

export const metadata: Metadata = { title: 'Anime importálása' };
export const dynamic = 'force-dynamic';

export default async function ImportAnimePage() {
  await ensurePermission('project:write', '/admin/projektek/import');

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl">Anime importálása</h1>
        <p className="mt-1 text-sm text-content-muted">
          Címek, borító, műfajok és a teljes epizódlista az AniList és a MyAnimeList felől. Ha
          inkább kézzel vinnéd fel,{' '}
          <Link
            href="/admin/projektek/uj"
            className="text-bloom-300 underline-offset-4 hover:underline"
          >
            itt az üres űrlap
          </Link>
          .
        </p>
      </header>

      <AnimeImport />
    </div>
  );
}
