import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { Building2, CalendarDays, Clapperboard, ExternalLink, Users } from 'lucide-react';
import { env } from '@/lib/env';
import { formatCount, toIsoString, truncate } from '@/lib/utils';
import { db } from '@/lib/db';
import {
  getPublicEpisodes,
  getPublicProjectBySlug,
  incrementProjectView,
} from '@/server/projects';
import { getCurrentUser } from '@/lib/auth/guards';
import {
  AGE_RATING_LABEL,
  Badge,
  PROJECT_TYPE_LABEL,
  ProjectStatusBadge,
  SEASON_LABEL,
} from '@/components/ui/badge';
import { Breadcrumbs } from '@/components/site/page-header';
import { EpisodeList } from '@/components/site/episode-list';
import { FollowButton } from '@/components/site/follow-button';
import { ReleaseListSkeleton } from '@/components/ui/feedback';

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const project = await getPublicProjectBySlug(slug);

  if (!project) {
    return { title: 'Projekt nem található', robots: { index: false, follow: false } };
  }

  const description = project.synopsis
    ? truncate(project.synopsis, 155)
    : `${project.title} – magyar felirat a Yonagi Fansubtól.`;

  const images = project.bannerImageUrl ?? project.coverImageUrl;

  return {
    title: project.title,
    description,
    alternates: { canonical: `/projektek/${project.slug}` },
    openGraph: {
      type: 'video.tv_show',
      title: project.title,
      description,
      url: `${env.NEXT_PUBLIC_SITE_URL}/projektek/${project.slug}`,
      images: images ? [{ url: images, width: 1200, height: 630, alt: project.title }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: project.title,
      description,
      images: images ? [images] : undefined,
    },
  };
}

/**
 * Project detail.
 *
 * `generateStaticParams` is deliberately omitted: the catalogue changes often
 * enough that ISR with tag invalidation (see `lib/cache.ts`) gives fresher pages
 * at the same cost, without a rebuild on every publish.
 */
export default async function ProjectPage({ params }: { params: Params }) {
  const { slug } = await params;
  const project = await getPublicProjectBySlug(slug);

  if (!project) notFound();

  const user = await getCurrentUser();

  const [episodes, favourite] = await Promise.all([
    getPublicEpisodes(project.id),
    user
      ? db.favorite.findUnique({
          where: { userId_projectId: { userId: user.id, projectId: project.id } },
          select: { notify: true },
        })
      : null,
  ]);

  // Fire-and-forget: never awaited, never allowed to fail the render.
  void incrementProjectView(project.id);

  const accent = project.accentColor ?? '#f761a8';
  const releasedCount = episodes.filter((episode) => episode.status === 'RELEASED').length;

  const staffByPosition = [...project.staff]
    .sort((a, b) => a.position.sortOrder - b.position.sortOrder)
    .reduce<Map<string, { name: string; color: string | null; members: typeof project.staff }>>(
      (map, credit) => {
        const entry = map.get(credit.position.key);
        if (entry) entry.members.push(credit);
        else
          map.set(credit.position.key, {
            name: credit.position.name,
            color: credit.position.color,
            members: [credit],
          });
        return map;
      },
      new Map(),
    );

  return (
    <>
      {/* Structured data: lets search engines show this as a series rather than
          as a generic page. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'TVSeries',
            name: project.title,
            alternateName: [project.titleRomaji, project.titleEnglish, project.titleNative].filter(
              Boolean,
            ),
            description: project.synopsis ?? undefined,
            image: project.coverImageUrl ?? undefined,
            url: `${env.NEXT_PUBLIC_SITE_URL}/projektek/${project.slug}`,
            numberOfEpisodes: project.totalEpisodes ?? undefined,
            genre: project.genres.map(({ genre }) => genre.name),
            productionCompany: project.studio ? { '@type': 'Organization', name: project.studio } : undefined,
            datePublished: toIsoString(project.publishedAt),
            inLanguage: 'ja',
            subtitleLanguage: 'hu',
          }),
        }}
      />

      <section className="relative isolate">
        <div className="absolute inset-0 -z-10 h-[26rem] overflow-hidden">
          {(project.bannerImageUrl ?? project.coverImageUrl) && (
            <Image
              src={(project.bannerImageUrl ?? project.coverImageUrl)!}
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover object-center opacity-40"
            />
          )}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background: `linear-gradient(180deg, color-mix(in oklab, ${accent} 14%, transparent) 0%, var(--color-canvas) 88%)`,
            }}
          />
          <div aria-hidden className="absolute inset-0 bg-linear-to-t from-canvas via-canvas/70 to-transparent" />
          <div aria-hidden className="noise absolute inset-0" />
        </div>

        <div className="container-content pt-8 pb-12">
          <Breadcrumbs crumbs={[{ label: 'Projektek', href: '/projektek' }, { label: project.title }]} />

          <div className="grid gap-8 lg:grid-cols-[minmax(0,15rem)_1fr] lg:gap-10">
            <div className="mx-auto w-40 sm:w-48 lg:mx-0 lg:w-full">
              <div
                className="relative aspect-2/3 overflow-hidden rounded-xl border border-ink-700 bg-ink-850 shadow-e4"
                style={{ boxShadow: `0 24px 64px -20px color-mix(in oklab, ${accent} 40%, transparent)` }}
              >
                {project.coverImageUrl ? (
                  <Image
                    src={project.coverImageUrl}
                    alt={`${project.title} borító`}
                    fill
                    priority
                    sizes="(min-width: 1024px) 240px, 192px"
                    className="object-cover"
                  />
                ) : (
                  <span className="grid size-full place-items-center font-jp text-5xl text-ink-600">
                    夜
                  </span>
                )}
              </div>
            </div>

            <div className="min-w-0">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <ProjectStatusBadge status={project.status} />
                <Badge tone="neutral">{PROJECT_TYPE_LABEL[project.type]}</Badge>
                {project.ageRating && (
                  <Badge tone="warning">{AGE_RATING_LABEL[project.ageRating]}</Badge>
                )}
                {project.isFeatured && <Badge tone="warm">Kiemelt</Badge>}
              </div>

              <h1 className="text-3xl leading-tight sm:text-4xl lg:text-5xl">{project.title}</h1>

              <div className="mt-2 space-y-0.5">
                {project.titleNative && (
                  <p className="font-jp text-base text-mist-400">{project.titleNative}</p>
                )}
                {project.titleRomaji && project.titleRomaji !== project.title && (
                  <p className="text-sm text-mist-500">{project.titleRomaji}</p>
                )}
              </div>

              {project.genres.length > 0 && (
                <ul className="mt-5 flex flex-wrap gap-2">
                  {project.genres.map(({ genre }) => (
                    <li key={genre.slug}>
                      <Link
                        href={`/projektek?genre=${genre.slug}`}
                        className="inline-flex rounded-full border border-ink-700 bg-ink-900/60 px-3 py-1 text-2xs text-mist-300 transition-colors duration-fast hover:border-bloom-400/40 hover:text-bloom-200"
                      >
                        {genre.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}

              {project.synopsis && (
                <p className="mt-6 max-w-2xl text-sm leading-relaxed text-mist-300 sm:text-base">
                  {project.synopsis}
                </p>
              )}

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <FollowButton
                  projectId={project.id}
                  projectSlug={project.slug}
                  initialFollowing={Boolean(favourite)}
                  isAuthenticated={Boolean(user)}
                  followerCount={project._count.favorites}
                />

                {project.trailerUrl && (
                  <a
                    href={project.trailerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-medium text-mist-300 transition-colors hover:bg-ink-800 hover:text-mist-100"
                  >
                    Előzetes
                    <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                )}
              </div>

              <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-ink-800 pt-6 sm:grid-cols-4">
                <Fact
                  icon={<Clapperboard className="size-3.5" aria-hidden />}
                  label="Epizódok"
                  value={`${releasedCount}${project.totalEpisodes ? ` / ${project.totalEpisodes}` : ''}`}
                />
                {project.seasonYear && (
                  <Fact
                    icon={<CalendarDays className="size-3.5" aria-hidden />}
                    label="Évad"
                    value={`${project.season ? `${SEASON_LABEL[project.season]} ` : ''}${project.seasonYear}`}
                  />
                )}
                {project.studio && (
                  <Fact
                    icon={<Building2 className="size-3.5" aria-hidden />}
                    label="Stúdió"
                    value={project.studio}
                  />
                )}
                <Fact
                  icon={<Users className="size-3.5" aria-hidden />}
                  label="Megtekintés"
                  value={formatCount(project.viewCount)}
                />
              </dl>
            </div>
          </div>
        </div>
      </section>

      <div className="container-content grid gap-10 pb-20 lg:grid-cols-[1fr_18rem] lg:gap-12">
        <section aria-labelledby="episodes">
          <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="episodes" className="text-xl sm:text-2xl">
              Epizódok
            </h2>
            <p className="nums text-sm text-content-muted">
              {releasedCount} megjelent · {episodes.length} felvéve
            </p>
          </div>

          <Suspense fallback={<ReleaseListSkeleton count={6} />}>
            <EpisodeList episodes={episodes} projectSlug={project.slug} />
          </Suspense>
        </section>

        <aside className="space-y-6 lg:pt-1">
          {staffByPosition.size > 0 && (
            <section aria-labelledby="credits">
              <h2
                id="credits"
                className="mb-3.5 text-2xs font-bold tracking-[0.18em] text-mist-500 uppercase"
              >
                Stáblista
              </h2>

              <dl className="space-y-3.5 rounded-xl border border-ink-800 bg-ink-900/40 p-4">
                {[...staffByPosition.entries()].map(([key, group]) => (
                  <div key={key}>
                    <dt
                      className="text-2xs font-medium"
                      style={{ color: group.color ?? 'var(--color-mist-500)' }}
                    >
                      {group.name}
                    </dt>
                    <dd className="mt-1 flex flex-wrap gap-x-2 gap-y-1">
                      {group.members.map((credit) => (
                        <Link
                          key={credit.id}
                          href={`/csapat/${credit.teamMember.slug}`}
                          className="text-sm text-mist-200 underline-offset-4 transition-colors hover:text-bloom-300 hover:underline"
                        >
                          {credit.teamMember.name}
                        </Link>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <section aria-labelledby="external">
            <h2
              id="external"
              className="mb-3.5 text-2xs font-bold tracking-[0.18em] text-mist-500 uppercase"
            >
              Adatlapok
            </h2>

            <ul className="space-y-2">
              {project.malId && (
                <ExternalRow
                  href={`https://myanimelist.net/anime/${project.malId}`}
                  label="MyAnimeList"
                />
              )}
              {project.anilistId && (
                <ExternalRow
                  href={`https://anilist.co/anime/${project.anilistId}`}
                  label="AniList"
                />
              )}
              {!project.malId && !project.anilistId && (
                <li className="text-sm text-mist-600">Nincs összekapcsolt adatlap.</li>
              )}
            </ul>
          </section>

          {project.source && (
            <section>
              <h2 className="mb-2 text-2xs font-bold tracking-[0.18em] text-mist-500 uppercase">
                Forrás
              </h2>
              <p className="text-sm text-mist-300">{project.source}</p>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}

function Fact({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-2xs tracking-wide text-mist-500 uppercase">
        {icon}
        {label}
      </dt>
      <dd className="nums mt-1 text-sm font-semibold text-mist-100">{value}</dd>
    </div>
  );
}

function ExternalRow({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="flex items-center justify-between gap-2 rounded-lg border border-ink-800 bg-ink-900/40 px-3.5 py-2.5 text-sm text-mist-300 transition-colors duration-fast hover:border-ink-600 hover:text-mist-100"
      >
        {label}
        <ExternalLink className="size-3.5 shrink-0 text-mist-600" aria-hidden />
      </a>
    </li>
  );
}
