import type { Metadata } from 'next';
import { ensurePermission } from '@/lib/auth/guards';
import { hasPermission } from '@/lib/auth/permissions';
import { toActor } from '@/lib/auth/session';
import { formatBytes } from '@/lib/utils';
import { mediaUsage } from '@/server/media';
import { MediaLibrary } from '@/components/admin/media-library';

export const metadata: Metadata = { title: 'Médiatár' };
export const dynamic = 'force-dynamic';

/**
 * Media library page.
 *
 * Deletion is gated on `media:delete` separately from `media:write`, so an
 * editor can add cover art without being able to remove a file another project
 * still points at. The grid hides the button and the endpoint enforces it.
 */
export default async function AdminMediaPage() {
  const user = await ensurePermission('media:write', '/admin/media');
  const usage = await mediaUsage();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl">Médiatár</h1>
        <p className="mt-1 text-sm text-content-muted">
          {usage.count} fájl · összesen {formatBytes(usage.totalBytes)}. Azonos tartalmú kép
          csak egyszer tárolódik: az ismételt feltöltés a meglévő példányra mutat.
        </p>
      </header>

      <MediaLibrary canDelete={hasPermission(toActor(user), 'media:delete')} />
    </div>
  );
}
