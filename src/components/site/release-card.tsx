import Image from 'next/image';
import Link from 'next/link';
import { Download, HardDrive } from 'lucide-react';
import { cn, formatBytes, formatCount, formatEpisodeNumber, formatRelative } from '@/lib/utils';
import { Badge, RESOLUTION_LABEL } from '@/components/ui/badge';
import type { ReleaseFeedItem } from '@/server/releases';

/**
 * Release row.
 *
 * The unit of the release feed. Two priorities drove the layout:
 *   1. Scannability — the episode number and the project title carry the row;
 *      codec/size metadata sits in a mono face so a column of them aligns.
 *   2. Mobile parity — below `sm` the technical strip wraps under the title
 *      instead of being truncated away, because on a phone the file size is
 *      exactly what people are checking before tapping download.
 */
export function ReleaseRow({
  release,
  showProject = true,
  className,
}: {
  release: ReleaseFeedItem;
  showProject?: boolean;
  className?: string;
}) {
  const episodeLabel = release.episode
    ? `${formatEpisodeNumber(release.episode.number.toString())}. rész`
    : release.kind === 'BATCH'
      ? 'Batch'
      : 'Kiadás';

  const href = release.episode
    ? `/projektek/${release.project.slug}/${formatEpisodeNumber(release.episode.number.toString())}`
    : `/projektek/${release.project.slug}`;

  const isFresh =
    release.releasedAt !== null &&
    Date.now() - new Date(release.releasedAt).getTime() < 3 * 86_400_000;

  return (
    <article
      className={cn(
        'group relative rounded-xl border border-ink-800 bg-ink-900/50',
        'transition-[border-color,background-color,transform] duration-base ease-out-quint',
        'hover:-translate-y-0.5 hover:border-ink-600 hover:bg-ink-850 motion-reduce:hover:translate-y-0',
        className,
      )}
    >
      <Link
        href={href}
        className="flex items-center gap-3.5 p-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide-400 sm:gap-4 sm:p-4"
      >
        <span className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-ink-800 sm:size-18">
          {release.project.coverImageUrl ? (
            <Image
              src={release.project.coverImageUrl}
              alt=""
              fill
              sizes="72px"
              className="object-cover transition-transform duration-base group-hover:scale-105 motion-reduce:group-hover:scale-100"
            />
          ) : (
            <span aria-hidden className="grid size-full place-items-center font-jp text-xl text-ink-600">
              夜
            </span>
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="nums text-sm font-bold text-tide-300">{episodeLabel}</span>
            {release.version > 1 && (
              <Badge tone="orchid" size="sm">
                v{release.version}
              </Badge>
            )}
            {isFresh && (
              <Badge tone="warm" size="sm" pulse>
                Friss
              </Badge>
            )}
          </div>

          {showProject && (
            <h3 className="mt-0.5 truncate text-sm font-medium text-mist-100 transition-colors duration-fast group-hover:text-tide-200">
              {release.project.title}
            </h3>
          )}

          {release.episode?.title && (
            <p className="mt-0.5 truncate text-xs text-mist-500">{release.episode.title}</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-2xs text-mist-500">
            <span className="text-mist-400">{RESOLUTION_LABEL[release.resolution]}</span>
            {release.format && <span>{release.format.container.toUpperCase()}</span>}
            {release.videoCodec && <span>{release.videoCodec}</span>}
            {release.fileSizeBytes !== null && (
              <span className="inline-flex items-center gap-1">
                <HardDrive className="size-3" aria-hidden />
                {formatBytes(release.fileSizeBytes)}
              </span>
            )}
          </div>
        </div>

        <div className="hidden shrink-0 flex-col items-end gap-1.5 text-right sm:flex">
          <span className="text-2xs text-mist-500">{formatRelative(release.releasedAt)}</span>
          <span className="nums inline-flex items-center gap-1.5 rounded-md bg-ink-850 px-2.5 py-1.5 text-2xs font-medium text-mist-300">
            <Download className="size-3" aria-hidden />
            {formatCount(release.downloadCount)}
          </span>
        </div>
      </Link>

      {/* Timestamp moves inline on mobile rather than disappearing. */}
      <p className="px-3 pb-3 text-2xs text-mist-600 sm:hidden">
        {formatRelative(release.releasedAt)} · {formatCount(release.downloadCount)} letöltés
      </p>
    </article>
  );
}
