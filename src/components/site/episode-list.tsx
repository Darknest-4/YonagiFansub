import Image from 'next/image';
import Link from 'next/link';
import { CalendarDays, Check, ChevronRight, Download } from 'lucide-react';
import {
  cn,
  formatBytes,
  formatDate,
  formatDuration,
  formatEpisodeNumber,
} from '@/lib/utils';
import { Badge, EpisodeStatusBadge, RESOLUTION_LABEL } from '@/components/ui/badge';
import { WorkflowProgress, buildWorkflowStages, overallProgress } from '@/components/ui/progress';
import { EmptyState } from '@/components/ui/feedback';
import type { EpisodeListItem } from '@/server/projects';

/**
 * Episode list.
 *
 * The list is the project page's centre of gravity, so it carries three
 * different stories at once and has to keep them legible:
 *   • Released episodes → what you can download, at which resolution and size.
 *   • In-progress episodes → how far along the pipeline is, per stage.
 *   • Planned episodes → that they exist at all, without pretending otherwise.
 *
 * A released row is a link; an unreleased one is not. Making a dead row look
 * clickable is the fastest way to lose a visitor's trust in the whole page.
 */
export interface WatchState {
  positionSec: number;
  completed: boolean;
}

export function EpisodeList({
  episodes,
  projectSlug,
  progress,
  className,
}: {
  episodes: EpisodeListItem[];
  projectSlug: string;
  /**
   * Hol tart a néző, epizódazonosító szerint. Kijelentkezve üres — a lista
   * ugyanúgy néz ki, csak a jelölések maradnak el.
   */
  progress?: Map<string, WatchState>;
  className?: string;
}) {
  if (episodes.length === 0) {
    return (
      <EmptyState
        icon={<CalendarDays className="size-6" aria-hidden />}
        title="Még nincs felvitt epizód"
        description="A projekt bejelentés alatt van. Amint elindul a munka, itt jelennek meg az epizódok és az állapotuk."
        compact
        className={className}
      />
    );
  }

  return (
    <ol className={cn('space-y-2.5', className)}>
      {episodes.map((episode) => (
        <li key={episode.id}>
          <EpisodeRow
            episode={episode}
            projectSlug={projectSlug}
            watch={progress?.get(episode.id)}
          />
        </li>
      ))}
    </ol>
  );
}

function EpisodeRow({
  episode,
  projectSlug,
  watch,
}: {
  episode: EpisodeListItem;
  projectSlug: string;
  watch?: WatchState;
}) {
  const number = formatEpisodeNumber(episode.number.toString());
  const released = episode.status === 'RELEASED' && episode.releases.length > 0;
  const stages = buildWorkflowStages(episode);
  const progress = overallProgress(stages);

  /*
    Félbehagyott rész csak akkor, ha van mihez viszonyítani.

    Hossz nélkül nem tudunk százalékot mondani, és egy csík, ami tetszőleges
    helyen áll meg, rosszabb a semminél — azt sugallná, hogy tudjuk, hol tart,
    pedig nem.
  */
  const partial =
    watch && !watch.completed && watch.positionSec > 30 && episode.durationSec
      ? Math.min(100, Math.round((watch.positionSec / episode.durationSec) * 100))
      : null;

  const body = (
    <>
      <div className="flex items-start gap-3.5 sm:gap-4">
        {/*
          A megnézett rész pipát kap a sorszám helyett — így egy tizenkét részes
          listán egy pillantással látszik, hol tartasz, anélkül hogy minden sort
          végig kellene olvasni.
        */}
        <span
          className={cn(
            'nums grid size-11 shrink-0 place-items-center rounded-lg font-display text-sm font-bold',
            watch?.completed
              ? 'bg-success-400/12 text-success-400 ring-1 ring-success-400/25'
              : released
                ? 'bg-bloom-400/12 text-bloom-200 ring-1 ring-bloom-400/25'
                : 'bg-ink-800 text-mist-500',
          )}
          aria-hidden
        >
          {watch?.completed ? <Check className="size-5" /> : number}
        </span>

        {episode.thumbnailUrl && (
          <span className="relative hidden aspect-16/9 w-28 shrink-0 overflow-hidden rounded-md bg-ink-800 sm:block">
            <Image
              src={episode.thumbnailUrl}
              alt=""
              fill
              sizes="112px"
              className="object-cover"
            />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className={cn(
                'text-sm font-semibold',
                released ? 'text-mist-100' : 'text-mist-300',
              )}
            >
              <span className="sr-only">{number}. rész: </span>
              {episode.title ?? `${number}. rész`}
            </h3>
            <EpisodeStatusBadge status={episode.status} />

            {watch?.completed && (
              <span className="inline-flex items-center gap-1 text-2xs font-medium text-success-400">
                <Check className="size-3" aria-hidden />
                Megnézve
              </span>
            )}
            {partial !== null && (
              <span className="text-2xs font-medium text-bloom-300">{partial}%-nál tartasz</span>
            )}
          </div>

          {episode.titleNative && (
            <p lang="ja" className="mt-0.5 truncate font-jp text-2xs text-mist-600">
              {episode.titleNative}
            </p>
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-mist-500">
            {episode.airedAt && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3" aria-hidden />
                {formatDate(episode.airedAt)}
              </span>
            )}
            {episode.durationSec && (
              <span className="nums">{formatDuration(episode.durationSec)}</span>
            )}
          </div>

          {/* Released: the download offer. Otherwise: the pipeline. */}
          {released ? (
            <ul className="mt-2.5 flex flex-wrap gap-1.5">
              {episode.releases.map((release) => (
                <li key={release.id}>
                  <Badge tone={release.version > 1 ? 'orchid' : 'accent'}>
                    <span className="font-mono">
                      {RESOLUTION_LABEL[release.resolution]}
                      {release.format ? ` ${release.format.container.toUpperCase()}` : ''}
                      {release.version > 1 ? ` v${release.version}` : ''}
                    </span>
                    {release.fileSizeBytes !== null && (
                      <span className="text-mist-500">· {formatBytes(release.fileSizeBytes)}</span>
                    )}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            episode.status !== 'PLANNED' &&
            episode.status !== 'CANCELLED' && (
              <div className="mt-3 max-w-md">
                <WorkflowProgress stages={stages} compact />
              </div>
            )
          )}
        </div>

        {released && (
          <span className="hidden shrink-0 items-center gap-1.5 self-center rounded-lg bg-ink-850 px-3 py-2 text-2xs font-medium text-bloom-200 transition-colors group-hover:bg-bloom-400/15 sm:inline-flex">
            <Download className="size-3.5" aria-hidden />
            Letöltés
            <ChevronRight className="size-3.5" aria-hidden />
          </span>
        )}
      </div>
    </>
  );

  const shell = cn(
    'block rounded-xl border p-3.5 transition-[border-color,background-color,transform] duration-base ease-out-quint sm:p-4',
    released
      ? 'group border-ink-800 bg-ink-900/50 hover:-translate-y-0.5 hover:border-bloom-400/30 hover:bg-ink-850 motion-reduce:hover:translate-y-0'
      : 'border-ink-850 bg-ink-900/25',
  );

  if (!released) {
    return (
      <div className={shell} aria-label={`${number}. rész – még nem jelent meg`}>
        {body}
        {progress > 0 && (
          <p className="sr-only">A munkafolyamat {progress} százaléknál tart.</p>
        )}
      </div>
    );
  }

  return (
    <Link
      href={`/projektek/${projectSlug}/${number}`}
      className={cn(shell, 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bloom-400')}
    >
      {body}
    </Link>
  );
}
