import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Users } from 'lucide-react';
import { PageHeader } from '@/components/site/page-header';
import { EmptyState } from '@/components/ui/feedback';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { groupByPosition, listPositions, listTeam, type TeamCard } from '@/server/team';
import { ButtonLink } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Csapat',
  description:
    'A Yonagi Fansub csapata: fordítók, időzítők, formázók, lektorok és enkóderek, akik a magyar feliratok mögött állnak.',
  alternates: { canonical: '/csapat' },
};

export const revalidate = 600;

/**
 * Team page.
 *
 * Grouped by primary position, because "who does the typesetting" is the
 * question people actually arrive with — a flat alphabetical roster answers
 * nobody's. Retired members are not shown here; they keep their profile page,
 * linked from the credits of whatever they worked on.
 */
export default async function TeamPage() {
  const [members, positions] = await Promise.all([listTeam(false), listPositions()]);
  const groups = groupByPosition(members);

  return (
    <div className="container-content py-10 lg:py-14">
      <PageHeader
        eyebrow="Emberek"
        title="A csapat"
        description="Egy fansub annyit ér, amennyit a tagjai beletesznek. Itt vannak, akik a Yonagi feliratait készítik."
        action={
          <ButtonLink href="/csatlakozz" variant="primary" size="md">
            Csatlakoznék
          </ButtonLink>
        }
      />

      {members.length === 0 ? (
        <EmptyState
          icon={<Users className="size-6" aria-hidden />}
          title="A csapatlista még készül"
          description="Hamarosan bemutatjuk a tagokat."
          className="mt-10"
        />
      ) : (
        <>
          <dl className="mt-9 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatTile label="Aktív tag" value={members.length} />
            <StatTile label="Pozíció" value={positions.length} />
            <StatTile
              label="Alapító"
              value={members.filter((member) => member.isFounder).length}
            />
            <StatTile
              label="Projekt-közreműködés"
              value={members.reduce((sum, member) => sum + member._count.projects, 0)}
            />
          </dl>

          <div className="mt-12 space-y-14">
            {groups.map((group) => (
              <section key={group.key} aria-labelledby={`group-${group.key}`}>
                <div className="mb-5 flex items-center gap-3">
                  <h2
                    id={`group-${group.key}`}
                    className="text-lg font-semibold"
                    style={{ color: group.color ?? undefined }}
                  >
                    {group.name}
                  </h2>
                  <span
                    aria-hidden
                    className="h-px flex-1 bg-linear-to-r from-ink-700 to-transparent"
                  />
                  <span className="nums text-2xs text-mist-600">{group.members.length} fő</span>
                </div>

                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {group.members.map((member) => (
                    <li key={member.id}>
                      <MemberCard member={member} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MemberCard({ member }: { member: TeamCard }) {
  const accent = member.accentColor ?? '#4cd8ff';
  const positions = member.positions.map((entry) => entry.position.name);

  return (
    <Link
      href={`/csapat/${member.slug}`}
      className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-ink-800 bg-ink-900/50 transition-[transform,border-color,box-shadow] duration-base ease-out-quint hover:-translate-y-1 hover:border-ink-600 hover:shadow-e3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide-400 motion-reduce:hover:translate-y-0"
    >
      <div
        aria-hidden
        className="h-16 w-full"
        style={{
          background: `linear-gradient(120deg, color-mix(in oklab, ${accent} 30%, #0b101f), #0b101f)`,
        }}
      >
        {member.avatarUrl && (
          <div className="relative size-full opacity-30">
            <Image src={member.avatarUrl} alt="" fill sizes="400px" className="object-cover blur-md" />
          </div>
        )}
      </div>

      <div className="-mt-8 px-4 pb-4">
        <Avatar
          name={member.name}
          src={member.avatarUrl}
          size="lg"
          className="ring-4 ring-ink-900"
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-mist-50 group-hover:text-tide-200">
            {member.name}
          </h3>
          {member.isFounder && (
            <Badge tone="warm" size="sm">
              Alapító
            </Badge>
          )}
        </div>

        {member.tagline && (
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-content-muted">
            {member.tagline}
          </p>
        )}

        <ul className="mt-3.5 flex flex-wrap gap-1.5">
          {positions.slice(0, 3).map((position) => (
            <li key={position}>
              <Badge size="sm">{position}</Badge>
            </li>
          ))}
          {positions.length > 3 && (
            <li>
              <Badge size="sm">+{positions.length - 3}</Badge>
            </li>
          )}
        </ul>

        {member._count.projects > 0 && (
          <p className="nums mt-3 text-2xs text-mist-600">
            {member._count.projects} projekten dolgozott
          </p>
        )}
      </div>
    </Link>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-ink-800 bg-ink-900/40 px-4 py-3.5">
      <dt className="text-2xs tracking-wide text-mist-500 uppercase">{label}</dt>
      <dd className="nums mt-1 font-display text-xl font-bold text-mist-50">{value}</dd>
    </div>
  );
}
