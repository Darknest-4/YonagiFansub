import { cn } from '@/lib/utils';

/**
 * Progress indicators.
 *
 * `WorkflowProgress` is the product's signature component: the fansub pipeline
 * (fordítás → időzítés → formázás → lektorálás → enkódolás → ellenőrzés) shown
 * as a single segmented bar. It is the single most-checked piece of information
 * on the site, so it gets a dedicated, honest visualisation rather than a
 * percentage buried in a table.
 */

export function ProgressBar({
  value,
  tone = 'accent',
  size = 'md',
  label,
  showValue = false,
  className,
}: {
  value: number;
  tone?: 'accent' | 'orchid' | 'warm' | 'success';
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  showValue?: boolean;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));

  const tones = {
    accent: 'from-tide-500 to-tide-300',
    orchid: 'from-orchid-500 to-orchid-300',
    warm: 'from-ember-500 to-ember-300',
    success: 'from-success-500 to-success-400',
  };

  const heights = { sm: 'h-1', md: 'h-1.5', lg: 'h-2.5' };

  return (
    <div className={cn('w-full', className)}>
      {(label || showValue) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          {label && <span className="text-2xs text-content-muted">{label}</span>}
          {showValue && <span className="nums text-2xs text-mist-300">{clamped}%</span>}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className={cn('w-full overflow-hidden rounded-full bg-ink-800', heights[size])}
      >
        <div
          className={cn(
            'h-full rounded-full bg-linear-to-r transition-[width] duration-slow ease-out-expo',
            tones[tone],
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

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
                    : 'from-tide-500 to-tide-300',
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
        <span className="nums text-sm font-semibold text-tide-300">{overall}%</span>
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
                    done ? 'from-success-500 to-success-400' : 'from-tide-500 to-tide-300',
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

/** Circular variant used on the admin dashboard stat tiles. */
export function ProgressRing({
  value,
  size = 56,
  strokeWidth = 5,
  className,
  label,
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className={cn('relative inline-flex', className)}>
      <svg
        width={size}
        height={size}
        role="img"
        aria-label={label ?? `${clamped}%`}
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-ink-800"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="stroke-tide-400 transition-[stroke-dashoffset] duration-slow ease-out-expo"
        />
      </svg>
      <span className="nums absolute inset-0 flex items-center justify-center text-xs font-semibold text-mist-100">
        {Math.round(clamped)}
      </span>
    </div>
  );
}
