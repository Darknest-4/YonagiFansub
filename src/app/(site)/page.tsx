import { Suspense } from 'react';
import { ArrowRight, Clapperboard, Newspaper, Sparkles } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import { SectionHeading } from '@/components/ui/card';
import { EmptyState, ProjectGridSkeleton, ReleaseListSkeleton } from '@/components/ui/feedback';
import { Hero } from '@/components/site/hero';
import { ProjectCard } from '@/components/site/project-card';
import { ReleaseRow } from '@/components/site/release-card';
import { NewsCard } from '@/components/site/news-card';
import { getFeaturedProjects, getOngoingProjects } from '@/server/projects';
import { getLatestReleases } from '@/server/releases';
import { listPublicNews } from '@/server/news';
import { getPublicStats } from '@/server/stats';

/**
 * Home page.
 *
 * Composed of independently-streamed sections: the hero and stats resolve first
 * and paint immediately, while the release feed and news grid stream in behind
 * their own Suspense boundaries. A slow news query therefore cannot hold the
 * whole page hostage.
 */

export const revalidate = 120;

export default async function HomePage() {
  const [featured, stats] = await Promise.all([getFeaturedProjects(1), getPublicStats()]);
  const hero = featured[0] ?? null;

  return (
    <>
      <Hero
        project={
          hero
            ? {
                slug: hero.slug,
                title: hero.title,
                titleNative: hero.titleNative,
                synopsis: hero.synopsis,
                type: hero.type,
                status: hero.status,
                seasonYear: hero.seasonYear,
                bannerImageUrl: hero.bannerImageUrl,
                coverImageUrl: hero.coverImageUrl,
                accentColor: hero.accentColor,
                genres: hero.genres,
                _count: { episodes: hero._count.episodes },
              }
            : null
        }
        stats={stats}
      />

      <div className="container-content space-y-24 pb-24">
        <Suspense fallback={<ReleaseListSkeleton count={6} />}>
          <LatestReleasesSection />
        </Suspense>

        <Suspense fallback={<ProjectGridSkeleton count={10} />}>
          <OngoingSection />
        </Suspense>

        <Suspense fallback={null}>
          <NewsSection />
        </Suspense>

        <JoinCta />
      </div>
    </>
  );
}

async function LatestReleasesSection() {
  const releases = await getLatestReleases(8);

  return (
    <section aria-labelledby="latest-releases">
      <SectionHeading
        eyebrow="Frissen kiadva"
        title={<span id="latest-releases">Legújabb kiadások</span>}
        description="A csapat legutóbbi munkái — epizódok, batch-ek és javított verziók."
        action={
          <ButtonLink
            href="/kiadasok"
            variant="ghost"
            size="sm"
            trailingIcon={<ArrowRight className="size-4" aria-hidden />}
          >
            Összes kiadás
          </ButtonLink>
        }
        className="mb-7"
      />

      {releases.length === 0 ? (
        <EmptyState
          icon={<Clapperboard className="size-6" aria-hidden />}
          title="Még nincs publikált kiadás"
          description="Amint az első epizód elkészül, itt fog megjelenni. Addig is nézd meg, min dolgozunk."
          action={{ label: 'Projektek', href: '/projektek' }}
          compact
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {releases.map((release) => (
            <ReleaseRow key={release.id} release={release} />
          ))}
        </div>
      )}
    </section>
  );
}

async function OngoingSection() {
  const projects = await getOngoingProjects(10);

  if (projects.length === 0) return null;

  return (
    <section aria-labelledby="ongoing-projects">
      <SectionHeading
        eyebrow="Éppen fut"
        title={<span id="ongoing-projects">Folyamatban lévő projektek</span>}
        description="Amin most dolgozunk. A haladás minden epizódnál valós időben követhető."
        action={
          <ButtonLink
            href="/projektek?status=ONGOING"
            variant="ghost"
            size="sm"
            trailingIcon={<ArrowRight className="size-4" aria-hidden />}
          >
            Összes projekt
          </ButtonLink>
        }
        className="mb-7"
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 lg:gap-5">
        {projects.map((project, index) => (
          <ProjectCard key={project.id} project={project} priority={index < 5} />
        ))}
      </div>
    </section>
  );
}

async function NewsSection() {
  const { items } = await listPublicNews(JSON.stringify({}), JSON.stringify({ page: 1, perPage: 4 }));

  if (items.length === 0) return null;

  const [lead, ...rest] = items;

  return (
    <section aria-labelledby="latest-news">
      <SectionHeading
        eyebrow="A csapattól"
        title={<span id="latest-news">Hírek és bejelentések</span>}
        action={
          <ButtonLink
            href="/hirek"
            variant="ghost"
            size="sm"
            trailingIcon={<ArrowRight className="size-4" aria-hidden />}
          >
            Összes hír
          </ButtonLink>
        }
        className="mb-7"
      />

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        {lead && <NewsCard post={lead} featured />}

        {rest.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            {rest.slice(0, 3).map((post) => (
              <NewsCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function JoinCta() {
  return (
    <section className="border-gradient relative overflow-hidden rounded-2xl bg-ink-900">
      <div aria-hidden className="aurora opacity-40" />
      <div aria-hidden className="noise absolute inset-0" />

      <div className="relative grid gap-8 p-8 sm:p-12 lg:grid-cols-[1.6fr_1fr] lg:items-center">
        <div>
          <p className="mb-3 flex items-center gap-2 text-2xs font-bold tracking-[0.22em] text-orchid-300 uppercase">
            <Sparkles className="size-3.5" aria-hidden />
            Csatlakozz
          </p>

          <h2 className="text-2xl sm:text-3xl">
            Szeretnél <span className="text-gradient">részt venni</span> a munkában?
          </h2>

          <p className="mt-4 max-w-xl text-sm leading-relaxed text-content-muted sm:text-base">
            Fordítót, időzítőt, formázót, lektort és enkódert is szívesen látunk — kezdőket
            is, ha van türelmed tanulni. Nem kell profinak lenned, csak megbízhatónak.
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            <ButtonLink href="/csatlakozz" variant="primary" size="md">
              Jelentkezem
            </ButtonLink>
            <ButtonLink
              href="/csapat"
              variant="ghost"
              size="md"
              trailingIcon={<ArrowRight className="size-4" aria-hidden />}
            >
              A csapat
            </ButtonLink>
          </div>
        </div>

        <ul className="space-y-3 text-sm">
          {[
            { icon: Clapperboard, label: 'Fordítás japánról vagy angolról' },
            { icon: Newspaper, label: 'Lektorálás és formázás' },
            { icon: Sparkles, label: 'Enkódolás és minőségellenőrzés' },
          ].map(({ icon: Icon, label }) => (
            <li
              key={label}
              className="flex items-center gap-3 rounded-xl border border-ink-800 bg-ink-950/50 px-4 py-3.5 text-mist-300"
            >
              <Icon className="size-4 shrink-0 text-tide-400" aria-hidden />
              {label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
