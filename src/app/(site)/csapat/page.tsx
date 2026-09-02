import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, FolderOpen, Star, Users } from 'lucide-react';
import { EmptyState } from '@/shared/ui/feedback';
import { ButtonLink } from '@/shared/ui/button';
import { LogoMark } from '@/shared/ui/logo';
import { MemberCard } from '@/features/team/components/member-card';
import { listPositions, listTeam } from '@/features/team/queries';
import { cn } from '@/shared/lib/utils';

export const metadata: Metadata = {
  title: 'Csapat',
  description:
    'A Yonagi Fansub csapata: fordítók, időzítők, formázók, lektorok és enkóderek, akik a magyar feliratok mögött állnak.',
  alternates: { canonical: '/csapat' },
};

export const revalidate = 600;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * What the team says it stands for.
 *
 * Hard-coded rather than a database table: it is the team's own statement about
 * itself, it changes roughly never, and a settings screen for five sentences
 * would cost more to build and maintain than editing this list.
 */
const VALUES = [
  'Minőség mindenek felett',
  'Tisztelet az alkotók felé',
  'Közösség és barátság',
  'Folyamatos fejlődés',
  'Szenvedély az animékért',
];

/**
 * Team page.
 *
 * Filtered by position through the URL rather than through client state. A
 * filtered roster is something people link to ("itt vannak a fordítóink"), it
 * survives a refresh and a back button, and it works before any JavaScript has
 * loaded — none of which a `useState` filter gives.
 */
export default async function TeamPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const requested = Array.isArray(raw.pozicio) ? raw.pozicio[0] : raw.pozicio;

  const [members, positions] = await Promise.all([listTeam(false), listPositions()]);

  // Only positions that somebody actually holds become tabs. A filter that
  // leads to an empty page is a filter that should not have been offered.
  const usedPositions = positions.filter((position) =>
    members.some((member) => member.positions.some((entry) => entry.position.key === position.key)),
  );

  const activeKey = usedPositions.some((position) => position.key === requested)
    ? requested
    : undefined;

  const visible = activeKey
    ? members.filter((member) =>
        member.positions.some((entry) => entry.position.key === activeKey),
      )
    : members;

  const founders = members.filter((member) => member.isFounder).length;
  const contributions = members.reduce((sum, member) => sum + member._count.projects, 0);

  return (
    <>
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden border-b border-ink-800">
        <div aria-hidden className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-linear-to-br from-bloom-900/25 via-ink-950 to-orchid-900/20" />
          <LogoMark
            id="team"
            className="absolute -top-16 right-0 size-96 opacity-[0.05] lg:right-24"
          />
          <div className="noise absolute inset-0" />
        </div>

        <div className="container-content grid gap-10 py-14 lg:grid-cols-[1.6fr_1fr] lg:items-center lg:py-18">
          <div>
            <p className="mb-3 text-2xs font-bold tracking-[0.28em] text-bloom-400 uppercase">
              Csapatunk
            </p>

            <h1 className="text-3xl leading-tight sm:text-4xl">
              Ismerd meg a{' '}
              <span className="text-gradient">Yonagi Fansubot!</span>
            </h1>

            <p className="mt-4 max-w-xl text-base leading-relaxed text-mist-300">
              Egy lelkes csapat vagyunk, akiket egy közös cél köt össze: hogy minőségi
              fordításokkal hozzuk közelebb hozzád az animéket.
            </p>

            <dl className="mt-8 grid max-w-lg grid-cols-3 gap-3">
              <StatTile
                icon={<Users className="size-4" aria-hidden />}
                value={members.length}
                label="Aktív tag"
              />
              <StatTile
                icon={<FolderOpen className="size-4" aria-hidden />}
                value={contributions}
                label="Közreműködés"
              />
              <StatTile
                icon={<Star className="size-4" aria-hidden />}
                value={founders}
                label="Alapító"
              />
            </dl>
          </div>

          <aside className="rounded-2xl border border-ink-800 bg-ink-900/60 p-6 backdrop-blur-sm">
            <LogoMark id="team-card" className="size-8" />
            <h2 className="mt-4 text-lg font-semibold text-mist-50">Együtt alkotunk.</h2>
            <p className="mt-2 text-sm leading-relaxed text-mist-300">
              Minden tagunk fontos része annak, amit csinálunk. Köszönet nekik a rengeteg
              munkáért!
            </p>
          </aside>
        </div>
      </section>

      <div className="container-content py-12">
        {members.length === 0 ? (
          <EmptyState
            icon={<Users className="size-6" aria-hidden />}
            title="A csapatlista még készül"
            description="Hamarosan bemutatjuk a tagokat."
          />
        ) : (
          <>
            <nav aria-label="Szűrés pozíció szerint" className="mb-8">
              <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <li>
                  <FilterPill href="/csapat" active={!activeKey} label="Összes" count={members.length} />
                </li>
                {usedPositions.map((position) => (
                  <li key={position.key}>
                    <FilterPill
                      href={`/csapat?pozicio=${position.key}`}
                      active={activeKey === position.key}
                      label={position.name}
                      count={
                        members.filter((member) =>
                          member.positions.some((entry) => entry.position.key === position.key),
                        ).length
                      }
                    />
                  </li>
                ))}
              </ul>
            </nav>

            <div className="grid gap-8 lg:grid-cols-[1fr_18rem] lg:gap-10">
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {visible.map((member) => (
                  <li key={member.id}>
                    <MemberCard member={member} />
                  </li>
                ))}
              </ul>

              <aside className="space-y-6">
                <section className="rounded-xl border border-bloom-500/25 bg-bloom-500/[0.06] p-5">
                  <h2 className="text-base font-semibold text-bloom-300">
                    Csatlakoznál hozzánk?
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-mist-300">
                    Mindig keresünk lelkes embereket, akik szívesen segítenének a háttérben
                    vagy a fordításokban.
                  </p>
                  <ButtonLink
                    href="/csatlakozz"
                    variant="primary"
                    size="sm"
                    className="mt-4 text-2xs tracking-[0.1em] uppercase"
                    trailingIcon={<ArrowRight className="size-3.5" aria-hidden />}
                  >
                    Jelentkezés
                  </ButtonLink>
                </section>

                <section>
                  <h2 className="mb-3 text-2xs font-bold tracking-[0.18em] text-mist-500 uppercase">
                    Amit képviselünk
                  </h2>
                  <ul className="space-y-2.5">
                    {VALUES.map((value) => (
                      <li key={value} className="flex items-start gap-2.5 text-sm text-mist-300">
                        <span
                          aria-hidden
                          className="mt-1.5 size-1.5 shrink-0 rounded-full bg-linear-to-r from-bloom-400 to-orchid-400"
                        />
                        {value}
                      </li>
                    ))}
                  </ul>
                </section>
              </aside>
            </div>

            <blockquote className="mt-14 rounded-2xl border border-ink-800 bg-ink-900/40 px-6 py-8 text-center">
              <p className="text-lg text-mist-100 italic sm:text-xl">
                Egyedül gyorsabb vagy, együtt messzebbre jutunk.
              </p>
              <footer className="mt-3 text-2xs tracking-wide text-mist-500 uppercase">
                — Yonagi Fansub
              </footer>
            </blockquote>
          </>
        )}
      </div>
    </>
  );
}

function StatTile({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div className="rounded-xl border border-ink-800 bg-ink-900/50 px-4 py-3.5">
      <dt className="flex items-center gap-1.5 text-2xs tracking-wide text-mist-500 uppercase">
        <span className="text-bloom-400">{icon}</span>
        <span className="truncate">{label}</span>
      </dt>
      <dd className="nums mt-1.5 font-display text-2xl font-bold text-mist-50">{value}</dd>
    </div>
  );
}

function FilterPill({
  href,
  active,
  label,
  count,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-2xs font-semibold tracking-[0.08em] whitespace-nowrap uppercase',
        'transition-[background-color,border-color,color] duration-fast',
        active
          ? 'border-bloom-500/50 bg-bloom-500/15 text-bloom-300'
          : 'border-ink-700 bg-ink-900/60 text-mist-400 hover:border-ink-600 hover:text-mist-100',
      )}
    >
      {label}
      <span className="nums text-mist-600">{count}</span>
    </Link>
  );
}
