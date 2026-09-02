import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CalendarDays, ExternalLink } from 'lucide-react';
import { ogImages } from '@/shared/lib/seo';
import { formatDate, truncate } from '@/shared/lib/utils';
import { renderMarkdown } from '@/shared/lib/markdown';
import { getPublicTeamMember } from '@/features/team/queries';
import { Breadcrumbs } from '@/shared/ui/page-header';
import { Avatar } from '@/shared/ui/avatar';
import { Badge } from '@/shared/ui/badge';
import { EmptyState } from '@/shared/ui/feedback';
import { siteUrl } from '@/shared/lib/site-url';

type Params = Promise<{ slug: string }>;

/** Social handles are stored as free-form JSON; each key gets a profile URL here. */
const SOCIAL_LINKS: Record<string, { label: string; url: (handle: string) => string }> = {
  discord: { label: 'Discord', url: (handle) => `https://discord.com/users/${handle}` },
  x: { label: 'X', url: (handle) => `https://x.com/${handle.replace(/^@/, '')}` },
  anilist: { label: 'AniList', url: (handle) => `https://anilist.co/user/${handle}` },
  myanimelist: {
    label: 'MyAnimeList',
    url: (handle) => `https://myanimelist.net/profile/${handle}`,
  },
  website: { label: 'Weboldal', url: (handle) => handle },
};

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const base = await siteUrl();
  const { slug } = await params;
  const member = await getPublicTeamMember(slug);

  if (!member) return { title: 'Csapattag nem található', robots: { index: false } };

  const description =
    member.tagline ?? truncate(member.bio ?? `${member.name} a Yonagi Fansub csapatában.`, 155);

  return {
    title: member.name,
    description,
    alternates: { canonical: `/csapat/${member.slug}` },
    openGraph: {
      type: 'profile',
      title: `${member.name} · Yonagi Fansub`,
      description,
      url: `${base}/csapat/${member.slug}`,
      ...ogImages(member.avatarUrl, member.name),
    },
  };
}

export default async function TeamMemberPage({ params }: { params: Params }) {
  const base = await siteUrl();
  const { slug } = await params;
  const member = await getPublicTeamMember(slug);

  if (!member) notFound();

  const accent = member.accentColor ?? '#f761a8';
  const bio = member.bio ? renderMarkdown(member.bio) : null;
  const socials = Object.entries((member.socials ?? {}) as Record<string, string>).filter(
    ([key, value]) => Boolean(value) && key in SOCIAL_LINKS,
  );

  // One credit row per project, listing every position they held on it.
  const creditsByProject = member.projects.reduce<
    Map<string, { project: (typeof member.projects)[number]['project']; positions: string[] }>
  >((map, credit) => {
    const entry = map.get(credit.project.slug);
    if (entry) entry.positions.push(credit.position.name);
    else map.set(credit.project.slug, { project: credit.project, positions: [credit.position.name] });
    return map;
  }, new Map());

  return (
    <div className="relative isolate">
      {/*
        A csapattag mint személy, a csapathoz kötve.

        Egy fansubnál a stáblista nem adminisztráció: ez az egyetlen hely, ahol
        egy fordító munkája név szerint látszik. A `memberOf` az, amitől ez a
        kereső számára is összefügg a csapattal, nem csak egy különálló oldal.
      */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Person',
            name: member.name,
            description: member.tagline ?? undefined,
            image: member.avatarUrl ?? undefined,
            url: `${base}/csapat/${member.slug}`,
            memberOf: {
              '@type': 'Organization',
              name: 'Yonagi Fansub',
              url: base,
            },
          }),
        }}
      />

      <div className="absolute inset-x-0 top-0 -z-10 h-64 overflow-hidden">
        {member.bannerUrl && (
          <Image src={member.bannerUrl} alt="" fill sizes="100vw" className="object-cover opacity-30" />
        )}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background: `linear-gradient(180deg, color-mix(in oklab, ${accent} 18%, transparent), var(--color-canvas) 92%)`,
          }}
        />
        <div aria-hidden className="noise absolute inset-0" />
      </div>

      <div className="container-content py-8 lg:py-10">
        <Breadcrumbs crumbs={[{ label: 'Csapat', href: '/csapat' }, { label: member.name }]} />

        <header className="flex flex-col items-start gap-6 sm:flex-row sm:items-end">
          <Avatar
            name={member.name}
            src={member.avatarUrl}
            size="2xl"
            priority
            className="ring-4 ring-canvas"
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-3xl sm:text-4xl">{member.name}</h1>
              {member.isFounder && <Badge tone="warm">Alapító</Badge>}
              {!member.isActive && <Badge tone="neutral">Inaktív</Badge>}
            </div>

            {member.tagline && (
              <p className="mt-2 text-base text-mist-300">{member.tagline}</p>
            )}

            <ul className="mt-4 flex flex-wrap gap-1.5">
              {member.positions.map((entry) => (
                <li key={entry.position.key}>
                  <Badge
                    tone={entry.isPrimary ? 'accent' : 'neutral'}
                    size="md"
                    className={entry.isPrimary ? 'font-semibold' : undefined}
                  >
                    {entry.position.name}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        </header>

        <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_16rem]">
          <div className="min-w-0">
            {bio ? (
              <div className="prose-yonagi max-w-prose" dangerouslySetInnerHTML={{ __html: bio.html }} />
            ) : (
              <p className="text-sm text-mist-500">Ez a tag még nem írt magáról bemutatkozót.</p>
            )}

            <section aria-labelledby="credits" className="mt-12">
              <h2 id="credits" className="mb-5 text-xl">
                Közreműködések
              </h2>

              {creditsByProject.size === 0 ? (
                <EmptyState
                  title="Még nincs publikált közreműködés"
                  description="Amint megjelenik egy projekt, amin dolgozott, itt fog szerepelni."
                  compact
                />
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {[...creditsByProject.values()].map(({ project, positions }) => (
                    <li key={project.slug}>
                      <Link
                        href={`/projektek/${project.slug}`}
                        className="group flex items-center gap-3 rounded-xl border border-ink-800 bg-ink-900/50 p-3 transition-colors duration-fast hover:border-bloom-400/30 hover:bg-ink-850"
                      >
                        <span className="relative aspect-2/3 w-12 shrink-0 overflow-hidden rounded-md bg-ink-800">
                          {project.coverImageUrl && (
                            <Image
                              src={project.coverImageUrl}
                              alt=""
                              fill
                              sizes="48px"
                              className="object-cover"
                            />
                          )}
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-mist-100 group-hover:text-bloom-200">
                            {project.title}
                          </span>
                          <span className="mt-0.5 block truncate text-2xs text-mist-500">
                            {positions.join(' · ')}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <aside className="space-y-6">
            <section className="rounded-xl border border-ink-800 bg-ink-900/40 p-4">
              <h2 className="mb-3 text-2xs font-bold tracking-[0.18em] text-mist-500 uppercase">
                Adatok
              </h2>

              <dl className="space-y-3 text-sm">
                {member.joinedAt && (
                  <div>
                    <dt className="flex items-center gap-1.5 text-2xs text-mist-500">
                      <CalendarDays className="size-3" aria-hidden />
                      Csatlakozott
                    </dt>
                    <dd className="mt-0.5 text-mist-200">{formatDate(member.joinedAt)}</dd>
                  </div>
                )}

                <div>
                  <dt className="text-2xs text-mist-500">Projektek</dt>
                  <dd className="nums mt-0.5 text-mist-200">{creditsByProject.size}</dd>
                </div>

                {member.user && (
                  <div>
                    <dt className="text-2xs text-mist-500">Felhasználónév</dt>
                    <dd className="mt-0.5 font-mono text-xs text-mist-200">
                      @{member.user.username}
                    </dd>
                  </div>
                )}
              </dl>
            </section>

            {socials.length > 0 && (
              <section>
                <h2 className="mb-3 text-2xs font-bold tracking-[0.18em] text-mist-500 uppercase">
                  Elérhetőségek
                </h2>
                <ul className="space-y-2">
                  {socials.map(([key, handle]) => {
                    const config = SOCIAL_LINKS[key]!;
                    return (
                      <li key={key}>
                        <a
                          href={config.url(handle)}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="flex items-center justify-between gap-2 rounded-lg border border-ink-800 bg-ink-900/40 px-3.5 py-2.5 text-sm text-mist-300 transition-colors duration-fast hover:border-ink-600 hover:text-mist-100"
                        >
                          {config.label}
                          <ExternalLink className="size-3.5 shrink-0 text-mist-600" aria-hidden />
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
