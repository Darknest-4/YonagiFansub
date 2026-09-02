import Image from 'next/image';
import Link from 'next/link';
import { cn, formatDate, toIsoString } from '@/shared/lib/utils';
import type { NewsCard as NewsCardData } from '@/features/news/queries';

/**
 * Compact news item.
 *
 * The sidebar form: a square thumbnail and three lines. `NewsCard` is the grid
 * form with a 3:2 image and an author row — the same data, but a card that size
 * in a 320px rail would push the release grid down for no gain.
 */
export function NewsItem({ post, className }: { post: NewsCardData; className?: string }) {
  const accent = post.category?.color ?? '#f761a8';

  return (
    <article className={cn('group', className)}>
      <Link
        href={`/hirek/${post.slug}`}
        className="flex gap-3.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bloom-400"
      >
        <div className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-ink-800 bg-ink-850">
          {post.coverImageUrl ? (
            <Image
              src={post.coverImageUrl}
              alt=""
              fill
              sizes="64px"
              className="object-cover transition-transform duration-base ease-out-quint group-hover:scale-105 motion-reduce:group-hover:scale-100"
            />
          ) : (
            <span
              aria-hidden
              className="grid size-full place-items-center font-jp text-lg"
              style={{ color: accent, background: `color-mix(in oklab, ${accent} 12%, #120c20)` }}
            >
              夜
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-1 text-sm font-semibold text-mist-50 transition-colors duration-fast group-hover:text-bloom-300">
            {post.title}
          </h3>

          {post.excerpt && (
            <p className="mt-1 line-clamp-2 text-2xs leading-relaxed text-content-muted">
              {post.excerpt}
            </p>
          )}

          <time
            dateTime={toIsoString(post.publishedAt)}
            className="nums mt-1.5 block text-2xs text-mist-600"
          >
            {formatDate(post.publishedAt)}
          </time>
        </div>
      </Link>
    </article>
  );
}
