import { cn } from '@/lib/utils';
import { ProjectStatusBadge } from '@/components/ui/badge';
import type { ProjectStatus } from '@prisma/client';

/**
 * A workflow step and how far the project is through it.
 *
 * The order is the order the work actually happens in, not alphabetical: a
 * reader should be able to see at a glance which stage the project is stuck at,
 * and that only works if the stages are in sequence.
 */
const STEPS = [
  { key: 'translation', label: 'Fordítás' },
  { key: 'editing', label: 'Lektorálás' },
  { key: 'timing', label: 'Időzítés' },
  { key: 'typesetting', label: 'Formázás' },
  { key: 'encoding', label: 'Kódolás' },
  { key: 'qc', label: 'Ellenőrzés' },
] as const;

export interface WorkflowProgress {
  translation: number;
  editing: number;
  timing: number;
  typesetting: number;
  encoding: number;
  qc: number;
}

/**
 * Project status panel.
 *
 * The number that matters to a follower is not "how many episodes exist" but
 * "how far along is the next one", and until now that lived only inside each
 * episode row. Averaging the workflow percentages across every episode that is
 * not yet released turns six per-episode numbers into one honest answer per
 * stage.
 *
 * Released episodes are excluded from the average on purpose. Including them
 * would drag every bar toward 100% and make a project that has ten finished
 * episodes and one barely-started one look nearly done — the opposite of what
 * somebody waiting for episode eleven needs to know.
 */
export function ProjectStatusCard({
  status,
  progress,
  releasedCount,
  totalCount,
  updatedAt,
  className,
}: {
  status: ProjectStatus;
  progress: WorkflowProgress | null;
  releasedCount: number;
  totalCount: number | null;
  updatedAt: Date | string;
  className?: string;
}) {
  return (
    <section
      aria-labelledby="project-status"
      className={cn('rounded-xl border border-ink-800 bg-ink-900/40 p-4', className)}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id="project-status" className="text-sm font-semibold text-mist-100">
          Státusz
        </h2>
        <ProjectStatusBadge status={status} />
      </div>

      <dl className="space-y-3">
        <div className="flex items-baseline justify-between gap-3 border-b border-ink-800 pb-3">
          <dt className="text-2xs text-mist-500">Megjelent rész</dt>
          <dd className="nums text-sm font-semibold text-mist-100">
            {releasedCount}
            {totalCount ? <span className="text-mist-500"> / {totalCount}</span> : null}
          </dd>
        </div>

        {progress ? (
          STEPS.map((step) => (
            <ProgressRow key={step.key} label={step.label} value={progress[step.key]} />
          ))
        ) : (
          <p className="text-2xs leading-relaxed text-mist-500">
            Minden felvett rész megjelent — nincs folyamatban lévő munka.
          </p>
        )}
      </dl>

      <p className="mt-4 border-t border-ink-800 pt-3 text-2xs text-mist-600">
        Utolsó frissítés:{' '}
        <time dateTime={new Date(updatedAt).toISOString()}>
          {new Intl.DateTimeFormat('hu-HU', { dateStyle: 'medium' }).format(new Date(updatedAt))}
        </time>
      </p>
    </section>
  );
}

function ProgressRow({ label, value }: { label: string; value: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <dt className="text-2xs text-mist-400">{label}</dt>
        <dd className="nums text-2xs font-medium text-mist-200">{clamped}%</dd>
      </div>

      {/*
        `aria-hidden` on the rail: the percentage is already read out as the
        definition above it, so exposing the bar too would make a screen reader
        announce the same number twice.
      */}
      <div aria-hidden className="h-1 overflow-hidden rounded-full bg-ink-800">
        <div
          className="h-full rounded-full bg-linear-to-r from-bloom-500 to-orchid-500 transition-[width] duration-slow ease-out-quint"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Averages the workflow fields over the episodes that are still in progress.
 * Returns `null` when there is nothing left to do, so the caller can say that
 * rather than draw six full bars.
 */
export function aggregateProgress(
  episodes: Array<{
    status: string;
    progressTranslation: number;
    progressEditing: number;
    progressTiming: number;
    progressTypesetting: number;
    progressEncoding: number;
    progressQc: number;
  }>,
): WorkflowProgress | null {
  const pending = episodes.filter((episode) => episode.status !== 'RELEASED');
  if (pending.length === 0) return null;

  const mean = (pick: (episode: (typeof pending)[number]) => number) =>
    Math.round(pending.reduce((total, episode) => total + pick(episode), 0) / pending.length);

  return {
    translation: mean((episode) => episode.progressTranslation),
    editing: mean((episode) => episode.progressEditing),
    timing: mean((episode) => episode.progressTiming),
    typesetting: mean((episode) => episode.progressTypesetting),
    encoding: mean((episode) => episode.progressEncoding),
    qc: mean((episode) => episode.progressQc),
  };
}
