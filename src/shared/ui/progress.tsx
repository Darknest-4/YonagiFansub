import { cn } from '@/shared/lib/utils';

/**
 * Progress indicators.
 *
 * `WorkflowProgress` is the product's signature component: the fansub pipeline
 * (fordítás → időzítés → formázás → lektorálás → enkódolás → ellenőrzés) shown
 * as a single segmented bar. It is the single most-checked piece of information
 * on the site, so it gets a dedicated, honest visualisation rather than a
 * percentage buried in a table.
 */

export interface WorkflowStage {
  key: string;
  label: string;
  short: string;
  value: number;
}

export function buildWorkflowStages(episode: {
  progressTranslation: number;
  progressTiming: number;
  progressTypesetting: number;
  progressEditing: number;
  progressEncoding: number;
  progressQc: number;
}): WorkflowStage[] {
  return [
    { key: 'translation', label: 'Fordítás', short: 'FOR', value: episode.progressTranslation },
    { key: 'timing', label: 'Időzítés', short: 'IDŐ', value: episode.progressTiming },
    { key: 'typesetting', label: 'Formázás', short: 'FRM', value: episode.progressTypesetting },
    { key: 'editing', label: 'Lektorálás', short: 'LEK', value: episode.progressEditing },
    { key: 'encoding', label: 'Enkódolás', short: 'ENC', value: episode.progressEncoding },
    { key: 'qc', label: 'Ellenőrzés', short: 'QC', value: episode.progressQc },
  ];
}

export function overallProgress(stages: WorkflowStage[]): number {
  if (stages.length === 0) return 0;
  return Math.round(stages.reduce((sum, stage) => sum + stage.value, 0) / stages.length);
}

export function WorkflowProgress({
  stages,
  compact = false,
  className,
}: {
  stages: WorkflowStage[];
  compact?: boolean;
  className?: string;
}) {
  const overall = overallProgress(stages);

  if (compact) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <div
          className="flex h-1.5 flex-1 gap-0.5 overflow-hidden rounded-full"
          role="progressbar"
          aria-valuenow={overall}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Munkafolyamat: ${overall}% kész`}
        >
          {stages.map((stage) => (
            <div key={stage.key} className="relative flex-1 overflow-hidden bg-ink-800">
              <div
                className={cn(
                  'h-full bg-linear-to-r transition-[width] duration-slow ease-out-expo',
                  stage.value >= 100
                    ? 'from-success-500 to-success-400'
                    : 'from-bloom-500 to-bloom-300',
                )}
                style={{ width: `${Math.max(0, Math.min(100, stage.value))}%` }}
              />
            </div>
          ))}
        </div>
        <span className="nums w-9 shrink-0 text-right text-2xs font-medium text-mist-300">
          {overall}%
        </span>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-mist-300">Munkafolyamat</span>
        <span className="nums text-sm font-semibold text-bloom-300">{overall}%</span>
      </div>

      <div className="grid grid-cols-3 gap-x-4 gap-y-3 sm:grid-cols-6">
        {stages.map((stage) => {
          const done = stage.value >= 100;
          return (
            <div key={stage.key}>
              <div className="mb-1.5 flex items-baseline justify-between gap-1">
                <span
                  className="text-2xs font-medium text-content-muted"
                  title={stage.label}
                >
                  <span className="sm:hidden">{stage.label}</span>
                  <span className="hidden sm:inline">{stage.label}</span>
                </span>
                <span
                  className={cn(
                    'nums text-2xs font-semibold',
                    done ? 'text-success-400' : 'text-mist-400',
                  )}
                >
                  {stage.value}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-ink-800">
                <div
                  role="progressbar"
                  aria-valuenow={stage.value}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={stage.label}
                  className={cn(
                    'h-full rounded-full bg-linear-to-r transition-[width] duration-slow ease-out-expo',
                    done ? 'from-success-500 to-success-400' : 'from-bloom-500 to-bloom-300',
                  )}
                  style={{ width: `${Math.max(0, Math.min(100, stage.value))}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
