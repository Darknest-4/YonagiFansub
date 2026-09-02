import Image from 'next/image';
import Link from 'next/link';
import { cn, formatDuration, formatEpisodeNumber, formatRelative } from '@/lib/utils';
import type { EpisodeFeedItem } from '@/server/episodes';

/**
 * Episode tile.
 *
 * The home page's "what came out" row. It leads with the artwork and carries
 * only what somebody scanning a front page needs — which series, which episode,
 * how long ago — because that is the question a front page answers. The detail
 * lives one tap away on the episode itself.
 *
 * The episode code is set in `S01E28` form deliberately: it is the notation
 * every fansub audience already reads, it scans better than "28. rész", and it
 * takes a third of the width.
 *
 * Replaces the old release tile. The badge that used to say `BD` for a batch is
 * gone with the release kinds — there is nothing left for it to mean.
 */
export function EpisodeTile({
  episode,
  priority = false,
  className,
}: {
  episode: EpisodeFeedItem;
  priority?: boolean;
  className?: string;
}) {
  const accent = episode.project.accentColor ?? '#f761a8';
  const cover = episode.thumbnailUrl ?? episode.project.coverImageUrl;

  const isFresh =
    episode.releasedAt !== null &&
    Date.now() - new Date(episode.releasedAt).getTime() < 3 * 86_400_000;

  // `number` is a Decimal in the schema and a string after the data cache;
  // `String()` lands both in the same place.
  const plain = formatEpisodeNumber(String(episode.number));
  const episodeCode = `S01E${plain.padStart(2, '0')}`;

  return (
    <article
      className={cn(
        'group relative overflow-hidden rounded-xl border border-ink-800 bg-ink-900/60',
        'transition-[transform,border-color,box-shadow] duration-base ease-out-quint',
        'hover:-translate-y-1 hover:border-bloom-500/40 hover:shadow-e3 motion-reduce:hover:translate-y-0',
        className,
      )}
    >
      {/*
        Straight to the episode, not to the project.

        The tile is about one episode; landing somebody on a project page to
        scroll for the row they just clicked is a step they should not have to
        take. The old release tile linked to the project because a release could
        be a batch with no single episode behind it — that case no longer exists.
      */}
      <Link
        href={`/projektek/${episode.project.slug}/${plain}`}
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

          {isFresh && (
            <span className="absolute top-2.5 left-2.5 rounded-md bg-bloom-500 px-2 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase">
              Új
            </span>
          )}
        </div>

        <div className="space-y-2 p-3.5">
          <h3 className="line-clamp-1 text-sm font-semibold text-mist-50 transition-colors duration-fast group-hover:text-bloom-300">
            {episode.project.title}
          </h3>

          <div className="flex items-center gap-2">
            <span className="nums font-mono text-2xs text-mist-400">{episodeCode}</span>
            {episode.durationSec && (
              <span className="nums rounded border border-ink-700 bg-ink-850 px-1.5 py-0.5 font-mono text-[10px] text-mist-300">
                {formatDuration(episode.durationSec)}
              </span>
            )}
          </div>

          <p className="text-2xs text-mist-600">{formatRelative(episode.releasedAt)}</p>
        </div>
      </Link>
    </article>
  );
}
