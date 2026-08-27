import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Play } from 'lucide-react';
import { cn, formatCount, truncate } from '@/lib/utils';
import { ButtonLink } from '@/components/ui/button';
import { Badge, PROJECT_TYPE_LABEL, ProjectStatusBadge } from '@/components/ui/badge';

export interface HeroProject {
  slug: string;
  title: string;
  titleNative: string | null;
  synopsis: string | null;
  type: string;
  status: 'ANNOUNCED' | 'ONGOING' | 'COMPLETED' | 'ON_HOLD' | 'DROPPED';
  seasonYear: number | null;
  bannerImageUrl: string | null;
  coverImageUrl: string | null;
  accentColor: string | null;
  genres: Array<{ genre: { slug: string; name: string } }>;
  _count: { episodes: number };
}

/**
 * Home hero.
 *
 * A single featured project, presented full-bleed. The decision to show one
 * title rather than a rotating carousel is deliberate: an auto-advancing hero
 * moves content out from under the pointer, is hostile to screen readers, and
 * measurably nobody clicks slide four. One editorially-chosen title, with the
 * rest of the catalogue one scroll away, does the job better.
 *
 * The layered background (image → accent wash → scrim → aurora → grain) is what
 * turns a flat cover into something cinematic while keeping AA contrast on every
 * piece of text.
 */
export function Hero({
  project,
  stats,
}: {
  project: HeroProject | null;
  stats: { projects: number; episodes: number; downloads: number };
}) {
  const accent = project?.accentColor ?? '#4cd8ff';
  const backdrop = project?.bannerImageUrl ?? project?.coverImageUrl ?? null;

  return (
    <section className="relative isolate overflow-hidden">
      <div className="absolute inset-0 -z-10">
        {backdrop && (
          <Image
            src={backdrop}
            alt=""
            fill
            priority
            sizes="100vw"
            className="scale-105 object-cover object-center opacity-45 blur-[2px]"
          />
        )}

        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background: `radial-gradient(120% 90% at 15% 10%, color-mix(in oklab, ${accent} 22%, transparent) 0%, transparent 58%)`,
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-linear-to-r from-ink-950 via-ink-950/92 to-ink-950/55"
        />
        <div aria-hidden className="absolute inset-0 bg-linear-to-t from-ink-950 to-transparent" />
        <div aria-hidden className="aurora opacity-60" />
        <div aria-hidden className="noise absolute inset-0" />
      </div>

      <div className="container-wide relative pt-16 pb-20 sm:pt-24 sm:pb-28 lg:pt-32 lg:pb-36">
        <div className="max-w-2xl">
          <p className="mb-5 flex items-center gap-3 text-2xs font-bold tracking-[0.28em] text-tide-300 uppercase">
            <span aria-hidden className="font-jp text-sm tracking-normal">
              夜凪
            </span>
            <span aria-hidden className="h-px w-8 bg-linear-to-r from-tide-400 to-transparent" />
            Yonagi Fansub
          </p>

          {project ? (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <ProjectStatusBadge status={project.status} />
                <Badge tone="neutral">{PROJECT_TYPE_LABEL[project.type] ?? project.type}</Badge>
                {project.seasonYear && <Badge tone="neutral">{project.seasonYear}</Badge>}
              </div>

              <h1 className="text-4xl leading-[1.05] font-extrabold sm:text-5xl lg:text-6xl">
                <span className="text-gradient">{project.title}</span>
              </h1>

              {project.titleNative && (
                <p className="mt-3 font-jp text-base text-mist-400">{project.titleNative}</p>
              )}

              {project.synopsis && (
                <p className="mt-6 max-w-xl text-base leading-relaxed text-mist-300 sm:text-lg">
                  {truncate(project.synopsis, 240)}
                </p>
              )}

              {project.genres.length > 0 && (
                <ul className="mt-6 flex flex-wrap gap-2">
                  {project.genres.slice(0, 5).map(({ genre }) => (
                    <li key={genre.slug}>
                      <Link
                        href={`/projektek?genre=${genre.slug}`}
                        className="inline-flex rounded-full border border-ink-700 bg-ink-900/70 px-3 py-1 text-2xs text-mist-300 backdrop-blur-sm transition-colors duration-fast hover:border-tide-400/40 hover:text-tide-200"
                      >
                        {genre.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <ButtonLink
                  href={`/projektek/${project.slug}`}
                  variant="primary"
                  size="lg"
                  leadingIcon={<Play className="size-4.5 fill-current" aria-hidden />}
                >
                  Megnézem
                </ButtonLink>

                <ButtonLink
                  href="/kiadasok"
                  variant="outline"
                  size="lg"
                  trailingIcon={<ArrowRight className="size-4" aria-hidden />}
                >
                  Friss kiadások
                </ButtonLink>
              </div>
            </>
          ) : (
            <>
              <h1 className="text-4xl leading-[1.05] font-extrabold sm:text-5xl lg:text-6xl">
                <span className="text-gradient">Magyar anime feliratok,</span>
                <br />
                <span className="text-mist-50">éjszakai csendben.</span>
              </h1>

              <p className="mt-6 max-w-xl text-base leading-relaxed text-mist-300 sm:text-lg">
                Gondosan fordított, időzített és formázott feliratok — pontos
                projektállapotokkal, átlátható kiadásokkal, felesleges hercehurca nélkül.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <ButtonLink href="/projektek" variant="primary" size="lg">
                  Projektek böngészése
                </ButtonLink>
                <ButtonLink
                  href="/kiadasok"
                  variant="outline"
                  size="lg"
                  trailingIcon={<ArrowRight className="size-4" aria-hidden />}
                >
                  Friss kiadások
                </ButtonLink>
              </div>
            </>
          )}

          <dl className="mt-12 grid max-w-lg grid-cols-3 gap-6 border-t border-ink-800/80 pt-7">
            <HeroStat label="Projekt" value={stats.projects} />
            <HeroStat label="Kiadott rész" value={stats.episodes} />
            <HeroStat label="Letöltés" value={stats.downloads} />
          </dl>
        </div>
      </div>

      {/* Bottom fade into the next section – keeps the hero from ending on a hard line. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-canvas to-transparent"
      />
    </section>
  );
}

function HeroStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-2xs tracking-wider text-mist-500 uppercase">{label}</dt>
      <dd className={cn('nums mt-1.5 font-display text-2xl font-bold text-mist-50 sm:text-3xl')}>
        {formatCount(value)}
      </dd>
    </div>
  );
}
