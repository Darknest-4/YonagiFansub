import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Tailwind-aware class merge. Later classes win over earlier conflicting ones. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * URL-safe slug. Handles Hungarian and Japanese-romanised input: accents are
 * folded, everything else collapses to single hyphens.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    // Strip combining diacritics: á→a, ő→o, ű→u, ñ→n …
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/** Human file size. Accepts bigint because `Release.fileSizeBytes` is a BigInt. */
export function formatBytes(bytes: number | bigint | null | undefined, decimals = 2): string {
  if (bytes === null || bytes === undefined) return '—';
  let value = typeof bytes === 'bigint' ? Number(bytes) : bytes;
  if (!Number.isFinite(value) || value <= 0) return '0 B';

  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : decimals).replace(/\.?0+$/, '')} ${BYTE_UNITS[unit]}`;
}

/** `3245` → `54:05`, `7325` → `2:02:05`. */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Compact counter: 1 234 → "1,2 e", 1 240 000 → "1,2 M". Hungarian formatting. */
export function formatCount(value: number): string {
  if (value < 1000) return String(value);
  if (value < 1_000_000) return `${(value / 1000).toFixed(1).replace('.', ',').replace(',0', '')} e`;
  return `${(value / 1_000_000).toFixed(1).replace('.', ',').replace(',0', '')} M`;
}

const HU_DATE = new Intl.DateTimeFormat('hu-HU', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

const HU_DATETIME = new Intl.DateTimeFormat('hu-HU', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? '—' : HU_DATE.format(date);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? '—' : HU_DATETIME.format(date);
}

/** "3 perce", "2 napja" – Hungarian relative time without pulling in a locale bundle. */
export function formatRelative(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';

  const diffSec = Math.round((Date.now() - date.getTime()) / 1000);
  const future = diffSec < 0;
  const abs = Math.abs(diffSec);

  if (abs < 45) return future ? 'hamarosan' : 'az imént';

  // [seconds in unit, "2 nap múlva", "2 napja"]
  const units: Array<[number, string, string]> = [
    [31_557_600, 'év', 'éve'],
    [2_629_800, 'hónap', 'hónapja'],
    [604_800, 'hét', 'hete'],
    [86_400, 'nap', 'napja'],
    [3_600, 'óra', 'órája'],
    [60, 'perc', 'perce'],
  ];

  for (const [seconds, forward, past] of units) {
    if (abs >= seconds) {
      const amount = Math.floor(abs / seconds);
      return future ? `${amount} ${forward} múlva` : `${amount} ${past}`;
    }
  }

  return future ? 'hamarosan' : 'az imént';
}

/** Truncate on a word boundary, appending an ellipsis. */
export function truncate(input: string, max = 160): string {
  if (input.length <= max) return input;
  const cut = input.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Strips markdown syntax to build meta descriptions and excerpts. */
export function stripMarkdown(input: string): string {
  return input
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function readingMinutes(markdown: string): number {
  const words = stripMarkdown(markdown).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** Deterministic initials for avatar fallbacks. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** Stable hue derived from a string – used for generated avatar/badge colours. */
export function hueFromString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
}

/** Episode numbers are Decimal in the database: 12 → "12", 12.5 → "12.5". */
export function formatEpisodeNumber(value: number | string): string {
  const num = typeof value === 'string' ? Number.parseFloat(value) : value;
  if (!Number.isFinite(num)) return String(value);
  return Number.isInteger(num) ? String(num) : String(num).replace(/0+$/, '').replace(/\.$/, '');
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Only allows same-origin relative paths – blocks open-redirect via `?next=`. */
export function safeRedirectPath(candidate: string | null | undefined, fallback = '/'): string {
  if (!candidate) return fallback;
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return fallback;
  if (candidate.includes('\\') || candidate.includes('\n')) return fallback;
  return candidate;
}

export function absoluteUrl(path: string, base: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${base.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}
