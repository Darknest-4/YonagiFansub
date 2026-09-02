import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ListChecks } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { ensureAuthenticated } from '@/shared/auth/guards';
import { EmptyState } from '@/shared/ui/feedback';
import { getWatchlist, type WatchlistItem } from '@/features/watch/watchlist-service';
import { WATCHLIST_LABELS, WATCHLIST_ORDER, type WatchlistStatus } from '@/features/watch/watchlist-rules';

export const metadata: Metadata = {
  title: 'Nézési listám',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * A néző saját listája, négy csoportban.
 *
 * A „nézem" áll elöl, mert ez az, amiért valaki megnyitja: hol tartok, mi
 * következik. A „tervezett" a második — az a lista, amiből választani szokás.
 * A befejezett és az elhagyott utoljára: emlék, nem teendő.
 *
 * Üres csoport nem jelenik meg. Négy fejléc, amiből három alatt nincs semmi,
 * nem szerkezet, csak zaj.
 */
export default async function WatchlistPage() {
  const user = await ensureAuthenticated('/profil/nezesi-lista');
  const items = await getWatchlist(user.id);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ListChecks className="size-6" aria-hidden />}
        title="Még üres a listád"
        description="Ahogy elkezdesz nézni egy sorozatot, magától felkerül ide. Amit később néznél meg, azt a projektoldalon jelölheted tervezettnek."
        action={{ label: 'Projektek böngészése', href: '/projektek' }}
      />
    );
  }

  const groups = WATCHLIST_ORDER.map((status) => ({
    status,
    items: items.filter((item) => item.status === status),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="space-y-9">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-lg font-semibold text-mist-100">Nézési listám</h2>
        <p className="nums text-sm text-content-muted">{items.length} projekt</p>
      </header>

      {groups.map((group) => (
        <section key={group.status} aria-labelledby={`wl-${group.status}`}>
          <div className="mb-3 flex items-baseline gap-2.5 border-b border-ink-800 pb-2">
            <h3
              id={`wl-${group.status}`}
              className="text-2xs font-bold tracking-[0.16em] text-mist-400 uppercase"
            >
              {WATCHLIST_LABELS[group.status]}
            </h3>
            <span className="nums text-2xs text-mist-600">{group.items.length}</span>
          </div>

          <ul className="space-y-2">
            {group.items.map((item) => (
              <li key={item.project.id}>
                <Row item={item} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="text-2xs leading-relaxed text-mist-600">
        A „nézem” és a „befejezett” abból következik, hol tartasz — nem kell
        beállítani. A „tervezett” és az „elhagyott” a te döntésed: a projekt
        oldalán jelölheted.
      </p>
    </div>
  );
}

const ACCENT: Record<WatchlistStatus, string> = {
  WATCHING: 'bg-bloom-500',
  PLANNED: 'bg-info-500',
  COMPLETED: 'bg-success-500',
  DROPPED: 'bg-ink-600',
};

function Row({ item }: { item: WatchlistItem }) {
  const { project } = item;

  return (
    <Link
      href={`/projektek/${project.slug}`}
      className={cn(
        'flex items-center gap-3.5 rounded-xl border border-ink-800 bg-ink-900/40 p-2.5 sm:p-3',
        'transition-colors duration-fast hover:border-bloom-400/30 hover:bg-ink-850',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bloom-400',
      )}
    >
      <span className="relative h-16 w-11 shrink-0 overflow-hidden rounded-md bg-ink-850 sm:h-20 sm:w-14">
        {project.coverImageUrl ? (
          <Image
            src={project.coverImageUrl}
            alt=""
            fill
            sizes="56px"
            className="object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="block size-full"
            style={{
              background: `linear-gradient(150deg, color-mix(in oklab, ${
                project.accentColor ?? '#f761a8'
              } 26%, #120c20), #0d0818)`,
            }}
          />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-mist-50">{project.title}</span>
        {project.titleNative && (
          <span lang="ja" className="block truncate font-jp text-2xs text-mist-500">
            {project.titleNative}
          </span>
        )}

        {/*
          Az előrehaladás csak ott, ahol jelent valamit. Egy tervezett
          sorozatnál a „0 / 12" nem információ, csak egy nulla.
        */}
        {item.percent !== null && item.completedEpisodes > 0 && (
          <span className="mt-1.5 block">
            <span className="nums block text-2xs text-mist-500">
              {item.completedEpisodes} / {item.releasedEpisodes} rész · {item.percent}%
            </span>
            <span
              aria-hidden
              className="mt-1 block h-1 overflow-hidden rounded-full bg-ink-800"
            >
              <span
                className={cn('block h-full rounded-full', ACCENT[item.status])}
                style={{ width: `${item.percent}%` }}
              />
            </span>
          </span>
        )}
      </span>
    </Link>
  );
}
