import type { Metadata } from 'next';
import { Star } from 'lucide-react';
import { db } from '@/lib/db';
import { ensureAuthenticated } from '@/lib/auth/guards';
import { ProjectCard } from '@/components/site/project-card';
import { EmptyState } from '@/components/ui/feedback';
import { projectCardArgs } from '@/server/projects';

export const metadata: Metadata = {
  title: 'Kedvenceim',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function FavoritesPage() {
  const user = await ensureAuthenticated('/profil/kedvencek');

  const favorites = await db.favorite.findMany({
    where: { userId: user.id, project: { deletedAt: null, publishStatus: 'PUBLISHED' } },
    orderBy: { createdAt: 'desc' },
    select: { notify: true, createdAt: true, project: projectCardArgs },
  });

  if (favorites.length === 0) {
    return (
      <EmptyState
        icon={<Star className="size-6" aria-hidden />}
        title="Nincs követett projekted"
        description="A projektoldalon a „Követem” gombbal tudsz feliratkozni. Új kiadásnál értesítünk."
        action={{ label: 'Projektek böngészése', href: '/projektek' }}
      />
    );
  }

  return (
    <section aria-labelledby="favorites">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 id="favorites" className="text-lg font-semibold text-mist-100">
          Követett projektek
        </h2>
        <p className="nums text-sm text-content-muted">{favorites.length} db</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {favorites.map((favorite) => (
          <ProjectCard key={favorite.project.id} project={favorite.project} />
        ))}
      </div>
    </section>
  );
}
