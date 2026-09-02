import { Suspense } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Clapperboard,
  FolderOpen,
  Newspaper,
  PlayCircle,
  Quote,
  Sparkles,
  Users,
} from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import { SectionHeading } from '@/components/ui/card';
import { EmptyState, ProjectGridSkeleton, ReleaseListSkeleton } from '@/components/ui/feedback';
import { Hero } from '@/components/site/hero';
import { ProjectCard } from '@/components/site/project-card';
import { EpisodeTile } from '@/components/site/episode-tile';
import { NewsItem } from '@/components/site/news-item';
import { NewsCard } from '@/components/site/news-card';
import { formatCount } from '@/lib/utils';
import { getFeaturedProjects, getOngoingProjects } from '@/server/projects';
import { getLatestEpisodes } from '@/server/episodes';
import { listPublicNews } from '@/server/news';
import { getPublicStats } from '@/server/stats';
import { getPublicSettings } from '@/server/settings';
import { siteJsonLd } from '@/lib/seo';
import { siteUrl } from '@/lib/site-url';

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
  // Három kiemelt projekt: a hero ennyi közt vált. Nem több — a negyedik diát
  // már mérhetően senki nem nézi meg, viszont minden dia egy teljes borítókép,
  // amit be kell tölteni.
  const [featured, stats, settings, base] = await Promise.all([
    getFeaturedProjects(3),
    getPublicStats(),
    getPublicSettings(),
    siteUrl(),
  ]);

  return (
    <>
      {/*
        Az oldal önazonossága, egy helyen kimondva.

        Enélkül a kereső szemében ez egy névtelen domain. Az `Organization` az,
        amihez a nevet és a logót hozzá tudja kötni; a `WebSite` a
        `SearchAction`-nel pedig a keresődobozt kínálja fel közvetlenül a
        találati listában — a `/kereses?q=` amúgy is megvan, ez csak szól róla.

        Csak a főoldalon, mert egy oldal egyszer mondja meg, hogy kicsoda.
      */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          // A beállítások szerkeszthetők, tehát üresre is állíthatók; a
          // strukturált adat nem maradhat félkész emiatt.
          __html: siteJsonLd(
            settings.siteName ?? 'Yonagi Fansub',
            settings.siteDescription ?? 'Magyar anime feliratok.',
            base,
          ),
        }}
      />

      <Hero
        projects={featured.map((project) => ({
          slug: project.slug,
          title: project.title,
          titleNative: project.titleNative,
          synopsis: project.synopsis,
          type: project.type,
          status: project.status,
          seasonYear: project.seasonYear,
          bannerImageUrl: project.bannerImageUrl,
          coverImageUrl: project.coverImageUrl,
          accentColor: project.accentColor,
          genres: project.genres,
          _count: { episodes: project._count.episodes },
        }))}
        stats={stats}
      />

      {/*
        A friss részek és a hírek egymás mellett, nem egymás alatt: mindkettő
        „mi történt mostanában" kérdésre válaszol, és külön szekcióként a
        látogatónak kétszer kellene ugyanazt a kérdést feltennie. A hírsáv
        keskenyebb, mert három sor szöveg nem igényel több helyet.
      */}
      <div className="container-content pt-14">
        <div className="grid gap-10 lg:grid-cols-[1fr_20rem] lg:gap-8">
          <Suspense fallback={<ReleaseListSkeleton count={4} />}>
            <LatestEpisodesSection />
          </Suspense>

          <Suspense fallback={null}>
            <NewsRail />
          </Suspense>
        </div>
      </div>

      <Suspense fallback={null}>
        <StatsStrip />
      </Suspense>

      <div className="container-content space-y-24 py-24">
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

async function LatestEpisodesSection() {
  const episodes = await getLatestEpisodes(8);

  return (
    <section aria-labelledby="latest-episodes">
      <RailHeading
        icon={<Clapperboard className="size-4" aria-hidden />}
        title={<span id="latest-episodes">Legújabb részek</span>}
        href="/projektek"
        linkLabel="Összes projekt"
      />

      {episodes.length === 0 ? (
        <EmptyState
          icon={<Clapperboard className="size-6" aria-hidden />}
          title="Még nincs megjelent rész"
          description="Amint az első epizód elkészül, itt fog megjelenni. Addig is nézd meg, min dolgozunk."
          action={{ label: 'Projektek', href: '/projektek' }}
          compact
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          {episodes.map((episode, index) => (
            <EpisodeTile key={episode.id} episode={episode} priority={index < 4} />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Hírsáv a friss részek mellett.
 *
 * Három bejegyzés, nem több: a sáv magassága a mellette lévő rácshoz
 * igazodik, és egy negyedik hír csak lelógna alóla.
 */
async function NewsRail() {
  const { items } = await listPublicNews(
    JSON.stringify({}),
    JSON.stringify({ page: 1, perPage: 3 }),
  );

  if (items.length === 0) return null;

  return (
    <section aria-labelledby="news-rail">
      <RailHeading
        icon={<Newspaper className="size-4" aria-hidden />}
        title={<span id="news-rail">Friss hírek</span>}
        href="/hirek"
        linkLabel="Összes hír"
      />

      <div className="space-y-5">
        {items.map((post) => (
          <NewsItem key={post.id} post={post} />
        ))}
      </div>
    </section>
  );
}

/**
 * Szekciócím a főoldali sávokhoz.
 *
 * Külön a `SectionHeading`-től: az egy önálló szekció fejléce leírással és
 * nagy címmel, ez pedig egy sávé — ikon, rövid cím, jobbra egy hivatkozás.
 * Ugyanazt a komponenst két ilyen eltérő sűrűségre hajlítani propokkal
 * mindkettőt rontaná.
 */
function RailHeading({
  icon,
  title,
  href,
  linkLabel,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="mb-5 flex items-center justify-between gap-4">
      <h2 className="flex items-center gap-2.5 text-sm font-bold tracking-[0.12em] text-mist-50 uppercase">
        <span className="grid size-7 place-items-center rounded-md border border-bloom-500/30 bg-bloom-500/10 text-bloom-400">
          {icon}
        </span>
        {title}
      </h2>

      <Link
        href={href}
        className="group inline-flex shrink-0 items-center gap-1 text-2xs font-semibold tracking-[0.1em] text-bloom-400 uppercase transition-colors duration-fast hover:text-bloom-300"
      >
        {linkLabel}
        <ArrowRight
          className="size-3.5 transition-transform duration-fast group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0"
          aria-hidden
        />
      </Link>
    </div>
  );
}

/**
 * Számok és egy mondat.
 *
 * A statisztika a heróból került ide: ott a névtábla alatt versenyzett a
 * figyelemért, itt viszont pont az a szerepe, hogy a friss tartalom után
 * megálljon a szem, mielőtt a katalógus következik.
 */
async function StatsStrip() {
  const stats = await getPublicStats();

  const items = [
    { icon: <FolderOpen className="size-5" aria-hidden />, value: stats.projects, label: 'Aktív projekt' },
    { icon: <PlayCircle className="size-5" aria-hidden />, value: stats.episodes, label: 'Kiadott rész' },
    { icon: <PlayCircle className="size-5" aria-hidden />, value: stats.views, label: 'Lejátszás' },
    { icon: <Users className="size-5" aria-hidden />, value: stats.members, label: 'Csapattag' },
  ];

  return (
    <section aria-label="A csapat számokban" className="container-content mt-16">
      <div className="grid gap-6 rounded-2xl border border-ink-800 bg-ink-900/50 p-6 sm:p-8 lg:grid-cols-[1.5fr_1fr] lg:gap-10">
        <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          {items.map((item) => (
            <div key={item.label} className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-bloom-500/25 bg-bloom-500/10 text-bloom-400">
                {item.icon}
              </span>
              <div className="min-w-0">
                <dd className="nums font-display text-xl font-bold text-mist-50">
                  {formatCount(item.value)}+
                </dd>
                <dt className="truncate text-2xs tracking-wide text-mist-500 uppercase">
                  {item.label}
                </dt>
              </div>
            </div>
          ))}
        </dl>

        <blockquote className="relative border-t border-ink-800 pt-6 lg:border-t-0 lg:border-l lg:border-ink-800 lg:pt-0 lg:pl-10">
          <Quote className="absolute -top-1 left-0 size-5 text-bloom-500/40 lg:left-10" aria-hidden />
          <p className="pt-6 text-sm leading-relaxed text-mist-200 italic lg:pt-0 lg:pl-8">
            „Az anime nem csak szórakozás, hanem egy érzés, amit megoszthatunk egymással.”
          </p>
          <footer className="mt-3 text-2xs text-mist-500 lg:pl-8">— Yonagi Fansub</footer>
        </blockquote>
      </div>
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
              <Icon className="size-4 shrink-0 text-bloom-400" aria-hidden />
              {label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
