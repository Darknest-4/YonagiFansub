import type { ReactNode } from 'react';
import type {
  ContactStatus,
  EpisodeStatus,
  ProjectStatus,
  PublishStatus,
  Resolution,
} from '@prisma/client';
import { cn } from '@/shared/lib/utils';

/**
 * Badge + the status vocabularies that map database enums to on-brand colour.
 *
 * Every enum the UI displays is translated in exactly one place. That is what
 * keeps "FHD_1080P" from leaking into the interface, and what guarantees that
 * "Folyamatban" is the same shade of amber on the project card, the admin table
 * and the release row.
 */

export type BadgeTone =
  | 'neutral'
  | 'accent'
  | 'orchid'
  | 'warm'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'sakura';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-ink-750/80 text-mist-300 border-ink-600',
  accent: 'bg-bloom-400/12 text-bloom-200 border-bloom-400/30',
  orchid: 'bg-orchid-400/12 text-orchid-200 border-orchid-400/30',
  warm: 'bg-ember-400/12 text-ember-300 border-ember-400/30',
  success: 'bg-success-500/12 text-success-400 border-success-500/30',
  warning: 'bg-warning-500/12 text-warning-400 border-warning-500/30',
  danger: 'bg-danger-500/12 text-danger-400 border-danger-500/30',
  info: 'bg-info-500/12 text-info-400 border-info-500/30',
  sakura: 'bg-sakura-400/12 text-sakura-300 border-sakura-400/30',
};

export interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  size?: 'sm' | 'md';
  icon?: ReactNode;
  /** Adds a soft pulsing dot – used for "live"/"in progress" states. */
  pulse?: boolean;
  className?: string;
  title?: string;
}

export function Badge({
  children,
  tone = 'neutral',
  size = 'sm',
  icon,
  pulse = false,
  className,
  title,
}: BadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-2xs' : 'px-2.5 py-1 text-xs',
        TONES[tone],
        className,
      )}
    >
      {pulse && (
        <span className="relative flex size-1.5 shrink-0">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
        </span>
      )}
      {icon}
      {children}
    </span>
  );
}

// ── Enum vocabularies ────────────────────────────────────────────────────────

export const PROJECT_STATUS: Record<ProjectStatus, { label: string; tone: BadgeTone }> = {
  ANNOUNCED: { label: 'Bejelentve', tone: 'info' },
  ONGOING: { label: 'Folyamatban', tone: 'accent' },
  COMPLETED: { label: 'Befejezett', tone: 'success' },
  ON_HOLD: { label: 'Szünetel', tone: 'warning' },
  DROPPED: { label: 'Elejtve', tone: 'danger' },
};

export const EPISODE_STATUS: Record<EpisodeStatus, { label: string; tone: BadgeTone }> = {
  PLANNED: { label: 'Tervezett', tone: 'neutral' },
  IN_PROGRESS: { label: 'Munkában', tone: 'warm' },
  QC: { label: 'Ellenőrzés', tone: 'orchid' },
  RELEASED: { label: 'Megjelent', tone: 'success' },
  CANCELLED: { label: 'Törölve', tone: 'danger' },
};

export const PUBLISH_STATUS: Record<PublishStatus, { label: string; tone: BadgeTone }> = {
  DRAFT: { label: 'Piszkozat', tone: 'neutral' },
  SCHEDULED: { label: 'Ütemezve', tone: 'info' },
  PUBLISHED: { label: 'Publikálva', tone: 'success' },
  ARCHIVED: { label: 'Archiválva', tone: 'warning' },
};

export const CONTACT_STATUS: Record<ContactStatus, { label: string; tone: BadgeTone }> = {
  NEW: { label: 'Új', tone: 'accent' },
  IN_PROGRESS: { label: 'Feldolgozás alatt', tone: 'warm' },
  ANSWERED: { label: 'Megválaszolva', tone: 'success' },
  ARCHIVED: { label: 'Archiválva', tone: 'neutral' },
  SPAM: { label: 'Spam', tone: 'danger' },
};

export const RESOLUTION_LABEL: Record<Resolution, string> = {
  SD_480P: '480p',
  HD_720P: '720p',
  FHD_1080P: '1080p',
  QHD_1440P: '1440p',
  UHD_2160P: '2160p',
};

export const PROJECT_TYPE_LABEL: Record<string, string> = {
  TV: 'TV sorozat',
  MOVIE: 'Film',
  OVA: 'OVA',
  ONA: 'ONA',
  SPECIAL: 'Special',
  MUSIC: 'Zenei videó',
};

export const SEASON_LABEL: Record<string, string> = {
  WINTER: 'Tél',
  SPRING: 'Tavasz',
  SUMMER: 'Nyár',
  FALL: 'Ősz',
};

export const AGE_RATING_LABEL: Record<string, string> = {
  G: 'Korhatár nélkül',
  PG: '6+',
  PG13: '13+',
  R17: '17+',
  R18: '18+',
};

export const RELEASE_KIND_LABEL: Record<string, string> = {
  EPISODE: 'Epizód',
  BATCH: 'Batch',
  MOVIE: 'Film',
  SPECIAL: 'Special',
  PATCH: 'Patch',
};

export const LINK_KIND_LABEL: Record<string, string> = {
  DIRECT: 'Közvetlen',
  TORRENT: 'Torrent',
  MAGNET: 'Magnet',
  STREAM: 'Online',
};

export function ProjectStatusBadge({
  status,
  className,
}: {
  status: ProjectStatus;
  className?: string;
}) {
  const config = PROJECT_STATUS[status];
  return (
    <Badge tone={config.tone} pulse={status === 'ONGOING'} className={className}>
      {config.label}
    </Badge>
  );
}

export function EpisodeStatusBadge({
  status,
  className,
}: {
  status: EpisodeStatus;
  className?: string;
}) {
  const config = EPISODE_STATUS[status];
  return (
    <Badge tone={config.tone} pulse={status === 'IN_PROGRESS'} className={className}>
      {config.label}
    </Badge>
  );
}

export function PublishStatusBadge({
  status,
  className,
}: {
  status: PublishStatus;
  className?: string;
}) {
  const config = PUBLISH_STATUS[status];
  return (
    <Badge tone={config.tone} className={className}>
      {config.label}
    </Badge>
  );
}
