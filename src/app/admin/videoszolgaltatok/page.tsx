import type { Metadata } from 'next';
import { ensurePermission } from '@/shared/auth/guards';
import { hasPermission } from '@/shared/auth/permissions';
import { toActor } from '@/shared/auth/session';
import { listVideoProviders } from '@/features/video/provider-service';
import { VideoProviderManager } from '@/features/video/components/video-provider-manager';

export const metadata: Metadata = { title: 'Videó-szolgáltatók' };
export const dynamic = 'force-dynamic';

export default async function VideoProvidersPage() {
  // Read is open to anyone who can attach a source; writing decides which
  // external hosts the site will frame, which is a security boundary.
  const user = await ensurePermission('episode:write', '/admin/videoszolgaltatok');
  const providers = await listVideoProviders();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl">Videó-szolgáltatók</h1>
        <p className="mt-1 max-w-2xl text-sm text-content-muted">
          Ahonnan a lejátszható videók jöhetnek. Új szolgáltató felvétele egy sor — nem kell
          hozzá újratelepítés. Ha egy tárhely elromlik, kapcsold ki: azzal minden forrása
          azonnal offline lesz, és később visszakapcsolható.
        </p>
      </header>

      <VideoProviderManager
        initial={providers.map((provider) => ({
          id: provider.id,
          slug: provider.slug,
          name: provider.name,
          kind: provider.kind,
          embedTemplate: provider.embedTemplate,
          urlPatterns: provider.urlPatterns,
          domains: provider.domains,
          allowPopups: provider.allowPopups,
          isEnabled: provider.isEnabled,
          sortOrder: provider.sortOrder,
          color: provider.color,
          notes: provider.notes,
          sourceCount: provider._count.sources,
        }))}
        canWrite={hasPermission(toActor(user), 'settings:write')}
      />
    </div>
  );
}
