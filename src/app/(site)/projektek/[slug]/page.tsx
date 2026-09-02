import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import {
  Building2,
  CalendarDays,
  Clapperboard,
  Download,
  ExternalLink,
  Star,
  Timer,
  Users,
} from 'lucide-react';
import { env } from '@/lib/env';
import { ogImages, twitterImages } from '@/lib/seo';
import { formatCount, formatDate, formatEpisodeNumber, toIsoString, truncate } from '@/lib/utils';
import { db } from '@/lib/db';
import {
  getPublicEpisodes,
  getPublicProjectBySlug,
  incrementProjectView,
} from '@/server/projects';
import { getCurrentUser } from '@/lib/auth/guards';
import { getProjectProgress, getRatingSummary } from '@/server/watch';
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
import { Comments } from '@/components/site/comments';
import { ExternalLinks } from '@/components/site/external-links';
import { OfficialLinks } from '@/components/site/official-links';
import { ProductionCredits } from '@/components/site/production-credits';
import { ProjectRelations } from '@/components/site/project-relations';
import { RatingWidget } from '@/components/site/rating-widget';
import {
  ProjectStatusCard,
  aggregateProgress,
} from '@/components/site/project-status-card';
import { Avatar } from '@/components/ui/avatar';
import { ReleaseListSkeleton } from '@/components/ui/feedback';
import { ButtonLink } from '@/components/ui/button';
import { getSettings } from '@/server/settings';

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
      ...ogImages(images, project.title),
    },
    twitter: {
      card: 'summary_large_image',
      title: project.title,
      description,
      ...twitterImages(images),
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

  const [settings, episodes, favourite, rating, watched] = await Promise.all([
    getSettings(),
    getPublicEpisodes(project.id),
    user
      ? db.favorite.findUnique({
          where: { userId_projectId: { userId: user.id, projectId: project.id } },
          select: { notify: true },
        })
      : null,
    // Nem gyorsítótárazva: a saját pontszámnak látszania kell abban a
    // pillanatban, ahogy leadták, és felhasználónként úgyis más.
    getRatingSummary(project.id, user?.id ?? null),
    user ? getProjectProgress(user.id, project.id) : null,
  ]);

  // Fire-and-forget: never awaited, never allowed to fail the render.
  void incrementProjectView(project.id);

  const accent = project.accentColor ?? '#f761a8';
  const released = episodes.filter((episode) => episode.status === 'RELEASED');
  const releasedCount = released.length;
  // A legmagasabb sorszámú megjelent rész — az `episodes` szám szerint növekvő.
  const latestRelease = released.at(-1) ?? null;

  /*
    A `malScore` a sémában Decimal, a data cache viszont sztringgé alakítja
    (lásd `lib/cache.ts`), így a találat és a hiba két különböző típust adna
    vissza. A `Number()` mindkettőt kezeli — a Decimal `valueOf`-ja is sztringet
    ad —, a `Number.isFinite` pedig kiszűri, ha egyik sem értelmezhető.
  */
  const malScore = project.malScore === null ? null : Number(project.malScore);

  const scoreLabel = [
    project.averageScore ? `${project.averageScore}%` : null,
    malScore !== null && Number.isFinite(malScore)
      ? `MAL ${malScore.toFixed(2).replace('.', ',')}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  // Az importált stúdiólista pontosabb, de a kézzel felvett mező erősebb: ha
  // valaki átírta, annak oka volt.
  const primaryStudio = project.studio ?? project.studios[0] ?? null;

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
            keywords: project.tags.length > 0 ? project.tags.join(', ') : undefined,
            productionCompany:
              project.studios.length > 0
                ? project.studios.map((name) => ({ '@type': 'Organization', name }))
                : primaryStudio
                  ? { '@type': 'Organization', name: primaryStudio }
                  : undefined,
            /*
              Most már van `aggregateRating` — és pont azért, ami eddig hiányzott.

              Korábban szándékosan kimaradt: az egyetlen pontszám az AniListé
              volt, a schema.org-nak viszont darabszám is kell hozzá, és olyat
              csak kitalálni lehetett volna. A saját értékelésekkel mindkét szám
              a miénk, tehát felelni tudunk érte. Ha még senki nem szavazott,
              továbbra sem írunk semmit — egy nulla elemű átlag nem adat.
            */
            aggregateRating:
              rating.count > 0 && rating.average !== null
                ? {
                    '@type': 'AggregateRating',
                    ratingValue: rating.average.toFixed(1),
                    ratingCount: rating.count,
                    bestRating: '10',
                    worstRating: '1',
                  }
                : undefined,
            startDate: toIsoString(project.startDate),
            endDate: toIsoString(project.endDate),
            countryOfOrigin: project.countryOfOrigin
              ? { '@type': 'Country', name: project.countryOfOrigin }
              : undefined,
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

              {/*
                A borító alatti gomb a leggyakoribb szándékot rövidíti le: aki
                egy projektoldalra érkezik, jellemzően a legfrissebb részt
                keresi, és ehhez eddig végig kellett görgetnie az epizódlistát.
                Csak akkor jelenik meg, ha van mit letölteni.
              */}
              {latestRelease && (
                <ButtonLink
                  href={`/projektek/${project.slug}/${formatEpisodeNumber(String(latestRelease.number))}`}
                  variant="primary"
                  size="md"
                  fullWidth
                  className="mt-4 text-2xs tracking-[0.1em] uppercase"
                  leadingIcon={<Download className="size-4" aria-hidden />}
                >
                  Legújabb rész
                </ButtonLink>
              )}
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
                  <p lang="ja" className="font-jp text-base text-mist-400">
                    {project.titleNative}
                  </p>
                )}
                {project.titleRomaji && project.titleRomaji !== project.title && (
                  <p lang="ja-Latn" className="text-sm text-mist-500">{project.titleRomaji}</p>
                )}
              </div>

              {project.genres.length > 0 && (
                <ul className="mt-5 flex flex-wrap gap-2">
                  {project.genres.map(({ genre }) => (
                    <li key={genre.slug}>
                      <Link
                        href={`/projektek?genre=${genre.slug}`}
                        className="inline-flex rounded-full border border-ink-700 bg-ink-900/60 px-3 py-2 text-2xs text-mist-300 transition-colors duration-fast hover:border-bloom-400/40 hover:text-bloom-200 sm:py-1"
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
                {primaryStudio && (
                  <Fact
                    icon={<Building2 className="size-3.5" aria-hidden />}
                    label="Stúdió"
                    value={primaryStudio}
                  />
                )}
                {scoreLabel && (
                  <Fact
                    icon={<Star className="size-3.5" aria-hidden />}
                    label="Értékelés"
                    value={scoreLabel}
                  />
                )}
                {project.durationMin && (
                  <Fact
                    icon={<Timer className="size-3.5" aria-hidden />}
                    label="Hossz"
                    value={`${project.durationMin} perc`}
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
            <EpisodeList
              episodes={episodes}
              projectSlug={project.slug}
              progress={watched ?? undefined}
            />
          </Suspense>

          <Comments
            target={{ projectId: project.id }}
            returnTo={`/projektek/${project.slug}`}
          />
        </section>

        <aside className="space-y-6 lg:pt-1">
          <ProjectStatusCard
            status={project.status}
            progress={aggregateProgress(episodes)}
            releasedCount={releasedCount}
            totalCount={project.totalEpisodes}
            updatedAt={project.updatedAt}
          />

          {project.genres.length > 0 && (
            <section aria-labelledby="genres">
              <h2
                id="genres"
                className="mb-3 text-2xs font-bold tracking-[0.18em] text-mist-500 uppercase"
              >
                Műfajok
              </h2>
              <ul className="flex flex-wrap gap-1.5">
                {project.genres.map(({ genre }) => (
                  <li key={genre.slug}>
                    <Link
                      href={`/projektek?genre=${genre.slug}`}
                      className="inline-flex rounded-md border border-ink-700 bg-ink-900/60 px-2.5 py-1 text-2xs text-mist-300 transition-colors duration-fast hover:border-bloom-500/40 hover:text-bloom-300"
                    >
                      {genre.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/*
            A címkék nem műfajok: az AniList finomabb bontása ("Időugrás", "Női
            főszereplő") az, ami alapján egy néző valójában válogat. Nem linkek,
            mert nincs mögöttük böngészhető lista — egy kattinthatónak látszó,
            sehová nem vezető címke rosszabb, mint egy sima szó.
          */}
          {project.tags.length > 0 && (
            <section aria-labelledby="tags">
              <h2
                id="tags"
                className="mb-3 text-2xs font-bold tracking-[0.18em] text-mist-500 uppercase"
              >
                Címkék
              </h2>
              <ul className="flex flex-wrap gap-1.5">
                {project.tags.slice(0, 18).map((tag) => (
                  <li
                    key={tag}
                    className="rounded-md border border-ink-800 bg-ink-900/40 px-2 py-0.5 text-2xs text-mist-400"
                  >
                    {tag}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {project.startDate && (
            <section aria-labelledby="airing">
              <h2
                id="airing"
                className="mb-3 text-2xs font-bold tracking-[0.18em] text-mist-500 uppercase"
              >
                Sugárzás
              </h2>
              <p className="text-sm text-mist-300">
                {formatDate(project.startDate)}
                {project.endDate ? ` – ${formatDate(project.endDate)}` : ' –'}
              </p>
            </section>
          )}

          <ProductionCredits
            studios={project.studios}
            producers={project.producers}
            licensors={project.licensors}
            countryOfOrigin={project.countryOfOrigin}
          />

          {staffByPosition.size > 0 && (
            <section aria-labelledby="credits">
              <h2
                id="credits"
                className="mb-3 text-2xs font-bold tracking-[0.18em] text-mist-500 uppercase"
              >
                Stáb
              </h2>

              {/*
                Arckép a név mellett: egy fansub csapatban a stáblista nem
                adminisztráció, hanem a névjegy. Az arc az, amitől a nevek
                emberekké válnak, és ez az egyetlen hely az oldalon, ahol egy
                fordító munkája név szerint látszik.
              */}
              <ul className="divide-y divide-ink-800 overflow-hidden rounded-xl border border-ink-800 bg-ink-900/40">
                {[...staffByPosition.entries()].flatMap(([key, group]) =>
                  group.members.map((credit) => (
                    <li key={`${key}-${credit.id}`}>
                      <Link
                        href={`/csapat/${credit.teamMember.slug}`}
                        className="flex items-center gap-3 px-3.5 py-2.5 transition-colors duration-fast hover:bg-ink-850"
                      >
                        <Avatar
                          name={credit.teamMember.name}
                          src={credit.teamMember.avatarUrl}
                          size="sm"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm text-mist-100">
                          {credit.teamMember.name}
                        </span>
                        <span
                          className="shrink-0 text-2xs"
                          style={{ color: group.color ?? 'var(--color-mist-500)' }}
                        >
                          {group.name}
                        </span>
                      </Link>
                    </li>
                  )),
                )}
              </ul>
            </section>
          )}

          {/*
            Removed entirely rather than shown read-only when ratings are off.

            A score with no way to add to it is a number whose meaning nobody
            can check — and the average shown would be frozen at whatever the
            last vote left it, which is worse information than none.
          */}
          {settings.ratingsEnabled && (
            <RatingWidget
              projectId={project.id}
              projectSlug={project.slug}
              initial={rating}
              canRate={Boolean(user?.emailVerifiedAt)}
              isAuthenticated={Boolean(user)}
            />
          )}

          <ProjectRelations relations={project.relations} currentSlug={project.slug} />

          <ExternalLinks
            malId={project.malId}
            anilistId={project.anilistId}
            title={project.titleRomaji ?? project.title}
          />

          <OfficialLinks links={project.externalLinks} />

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
