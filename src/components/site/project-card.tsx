import Image from 'next/image';
import Link from 'next/link';
import { Layers, PlayCircle } from 'lucide-react';
import { cn, formatCount } from '@/lib/utils';
import { Badge, PROJECT_TYPE_LABEL, ProjectStatusBadge, SEASON_LABEL } from '@/components/ui/badge';
import type { ProjectCard as ProjectCardData } from '@/server/projects';

/**
 * Project card.
 *
 * A 2:3 poster is the anime-industry convention and the shape every cover art
 * already exists in — fighting it would mean cropping every image badly. The
 * whole card is one link with a single accessible name; the metadata below is
 * decoration, not extra tab stops.
 *
 * The accent colour stored per project tints the hover glow, so a wall of cards
 * still reads as a set while each title keeps its own identity.
 */
export function ProjectCard({
  project,
  priority = false,
  className,
}: {
  project: ProjectCardData;
  priority?: boolean;
  className?: string;
}) {
  const releasedEpisodes = project._count.episodes;
  const accent = project.accentColor ?? '#f761a8';

  return (
    <article className={cn('group relative', className)}>
      <Link
        href={`/projektek/${project.slug}`}
        className="block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-bloom-400"
      >
        <div
          className={cn(
            'relative aspect-2/3 overflow-hidden rounded-xl border border-ink-700/70 bg-ink-850',
            'transition-[transform,border-color,box-shadow] duration-base ease-out-quint',
            'group-hover:-translate-y-1.5 group-hover:border-ink-600',
            'motion-reduce:group-hover:translate-y-0',
          )}
          style={{ ['--card-accent' as string]: accent }}
        >
          {project.coverImageUrl ? (
            <Image
              src={project.coverImageUrl}
              alt=""
              fill
              priority={priority}
              sizes="(min-width: 1280px) 18vw, (min-width: 1024px) 22vw, (min-width: 640px) 30vw, 45vw"
              className="object-cover transition-transform duration-cinematic ease-out-expo group-hover:scale-105 motion-reduce:group-hover:scale-100"
            />
          ) : (
            <div className="grid size-full place-items-center bg-linear-160 from-ink-800 to-ink-900">
              <span aria-hidden className="font-jp text-4xl text-ink-600">
                夜
              </span>
            </div>
          )}

          {/* Legibility scrim – always present so text contrast never depends on
              the artwork behind it. */}
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-3/5 bg-linear-to-t from-ink-950 via-ink-950/70 to-transparent"
          />

          {/* Accent glow on hover. */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-0 transition-opacity duration-base group-hover:opacity-100"
            style={{
              boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${accent} 45%, transparent), 0 12px 40px -12px color-mix(in oklab, ${accent} 55%, transparent)`,
            }}
          />

          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2.5">
            <ProjectStatusBadge status={project.status} />
            {project.isFeatured && (
              <Badge tone="warm" size="sm">
                Kiemelt
              </Badge>
            )}
          </div>

          <div className="absolute inset-x-0 bottom-0 p-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-mist-300">
              <span className="font-medium">{PROJECT_TYPE_LABEL[project.type]}</span>
              {project.seasonYear && (
                <>
                  <span aria-hidden className="text-mist-600">
                    ·
                  </span>
                  <span className="nums">
                    {project.season ? `${SEASON_LABEL[project.season]} ` : ''}
                    {project.seasonYear}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Play affordance, revealed on hover. */}
          <div
            aria-hidden
            className={cn(
              'absolute inset-0 grid place-items-center opacity-0',
              'transition-opacity duration-base group-hover:opacity-100',
            )}
          >
            <PlayCircle className="size-11 text-white/85 drop-shadow-lg" strokeWidth={1.4} />
          </div>
        </div>

        <div className="mt-3 px-0.5">
          <h3 className="line-clamp-2 text-sm leading-snug font-semibold text-mist-100 transition-colors duration-fast group-hover:text-bloom-200">
            {project.title}
          </h3>

          {project.titleNative && (
            <p className="mt-1 line-clamp-1 font-jp text-2xs text-mist-600">
              {project.titleNative}
            </p>
          )}

          <div className="mt-2 flex items-center gap-3 text-2xs text-mist-500">
            <span className="nums inline-flex items-center gap-1">
              <Layers className="size-3" aria-hidden />
              {releasedEpisodes}
              {project.totalEpisodes ? ` / ${project.totalEpisodes}` : ''} rész
            </span>
            {project.viewCount > 100 && (
              <span className="nums">{formatCount(project.viewCount)} megtekintés</span>
            )}
          </div>
        </div>
      </Link>
    </article>
  );
}

/** Horizontal variant used in the "continue watching"-style rails. */
export function ProjectCardCompact({ project }: { project: ProjectCardData }) {
  return (
    <Link
      href={`/projektek/${project.slug}`}
      className="group flex items-center gap-3 rounded-xl border border-ink-800 bg-ink-900/60 p-2.5 transition-colors duration-fast hover:border-ink-600 hover:bg-ink-850"
    >
      <span className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-ink-800">
        {project.coverImageUrl && (
          <Image
            src={project.coverImageUrl}
            alt=""
            fill
            sizes="56px"
            className="object-cover"
          />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-mist-100 group-hover:text-bloom-200">
          {project.title}
        </span>
        <span className="nums mt-0.5 block text-2xs text-mist-500">
          {project._count.episodes} rész elérhető
        </span>
      </span>
    </Link>
  );
}
