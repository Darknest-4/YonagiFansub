import Image from 'next/image';
import Link from 'next/link';
import { cn, formatEpisodeNumber, formatRelative } from '@/lib/utils';
import { RESOLUTION_LABEL } from '@/components/ui/badge';
import type { ReleaseFeedItem } from '@/server/releases';

/**
 * Release tile.
 *
 * The home page's release row. Distinct from `ReleaseRow` (the dense list used
 * on `/kiadasok`) because the two answer different questions: the list is for
 * "find the version I want", this is for "what came out". So it leads with the
 * artwork and carries only what a person scanning a front page needs — what it
 * is, which episode, what quality, how long ago.
 *
 * The episode code is set in `S01E28` form deliberately. It is the notation
 * every fansub audience already reads, it sorts and scans better than "28. rész",
 * and it takes a third of the width.
 */
export function ReleaseTile({
  release,
  priority = false,
  className,
}: {
  release: ReleaseFeedItem;
  priority?: boolean;
  className?: string;
}) {
  const accent = release.project.accentColor ?? '#f761a8';
  const cover = release.episode?.thumbnailUrl ?? release.project.coverImageUrl;

  const isFresh =
    release.releasedAt !== null &&
    Date.now() - new Date(release.releasedAt).getTime() < 3 * 86_400_000;

  // A `number` a sémában Decimal; a data cache után sztringként érkezik, előtte
  // Decimal példányként — a `String()` mindkettőt ugyanoda vezeti.
  const episodeCode = release.episode
    ? `S01E${formatEpisodeNumber(String(release.episode.number)).padStart(2, '0')}`
    : null;

  return (
    <article
      className={cn(
        'group relative overflow-hidden rounded-xl border border-ink-800 bg-ink-900/60',
        'transition-[transform,border-color,box-shadow] duration-base ease-out-quint',
        'hover:-translate-y-1 hover:border-bloom-500/40 hover:shadow-e3 motion-reduce:hover:translate-y-0',
        className,
      )}
    >
      <Link
        href={`/projektek/${release.project.slug}`}
        className="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bloom-400"
      >
        <div className="relative aspect-16/10 overflow-hidden bg-ink-850">
          {cover ? (
            <Image
              src={cover}
              alt=""
              fill
              priority={priority}
              sizes="(min-width: 1280px) 20vw, (min-width: 640px) 40vw, 80vw"
              className="object-cover transition-transform duration-cinematic ease-out-expo group-hover:scale-105 motion-reduce:group-hover:scale-100"
            />
          ) : (
            <div
              aria-hidden
              className="size-full"
              style={{
                background: `linear-gradient(150deg, color-mix(in oklab, ${accent} 26%, #120c20), #0d0818)`,
              }}
            />
          )}

          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-ink-900 to-transparent"
          />

          {/* One badge at most. `ÚJ` wins over `BD` when both apply: recency is
              what a front page is for, the source is a detail. */}
          {isFresh ? (
            <span className="absolute top-2.5 left-2.5 rounded-md bg-bloom-500 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase">
              Új
            </span>
          ) : release.kind === 'BATCH' ? (
            <span className="absolute top-2.5 left-2.5 rounded-md bg-orchid-500 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase">
              BD
            </span>
          ) : null}
        </div>

        <div className="space-y-2 p-3.5">
          <h3 className="line-clamp-1 text-sm font-semibold text-mist-50 transition-colors duration-fast group-hover:text-bloom-300">
            {release.project.title}
          </h3>

          <div className="flex items-center gap-2">
            {episodeCode && (
              <span className="nums font-mono text-2xs text-mist-400">{episodeCode}</span>
            )}
            <span className="rounded border border-ink-700 bg-ink-850 px-1.5 py-0.5 font-mono text-[10px] text-mist-300">
              {RESOLUTION_LABEL[release.resolution]}
            </span>
          </div>

          <p className="text-2xs text-mist-600">{formatRelative(release.releasedAt)}</p>
        </div>
      </Link>
    </article>
  );
}
