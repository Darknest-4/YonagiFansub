import Image from 'next/image';
import Link from 'next/link';
import { Clock, Pin } from 'lucide-react';
import { cn, formatDate, toIsoString } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { NewsCard as NewsCardData } from '@/server/news';

/**
 * News card.
 *
 * Two densities from one component: `featured` gives the lead story a 16:9
 * image and a larger measure, `default` is the grid unit. Category colour comes
 * from the database so the editorial team controls the taxonomy's visual
 * language without a deploy.
 */
export function NewsCard({
  post,
  featured = false,
  priority = false,
  className,
}: {
  post: NewsCardData;
  featured?: boolean;
  priority?: boolean;
  className?: string;
}) {
  const categoryColor = post.category?.color ?? '#4cd8ff';

  return (
    <article
      className={cn(
        'group relative overflow-hidden rounded-xl border border-ink-800 bg-ink-900/50',
        'transition-[transform,border-color,box-shadow] duration-base ease-out-quint',
        'hover:-translate-y-1 hover:border-ink-600 hover:shadow-e3 motion-reduce:hover:translate-y-0',
        className,
      )}
    >
      <Link
        href={`/hirek/${post.slug}`}
        className="flex h-full flex-col focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tide-400"
      >
        <div
          className={cn(
            'relative overflow-hidden bg-ink-850',
            featured ? 'aspect-16/9' : 'aspect-3/2',
          )}
        >
          {post.coverImageUrl ? (
            <Image
              src={post.coverImageUrl}
              alt=""
              fill
              priority={priority}
              sizes={featured ? '(min-width: 1024px) 60vw, 100vw' : '(min-width: 768px) 33vw, 100vw'}
              className="object-cover transition-transform duration-cinematic ease-out-expo group-hover:scale-105 motion-reduce:group-hover:scale-100"
            />
          ) : (
            <div
              aria-hidden
              className="size-full"
              style={{
                background: `linear-gradient(150deg, color-mix(in oklab, ${categoryColor} 22%, #0b101f), #080b16)`,
              }}
            />
          )}

          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-ink-900 to-transparent"
          />

          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
            {post.category && (
              <span
                className="inline-flex items-center rounded-full border px-2.5 py-1 text-2xs font-semibold backdrop-blur-sm"
                style={{
                  color: categoryColor,
                  borderColor: `color-mix(in oklab, ${categoryColor} 35%, transparent)`,
                  backgroundColor: `color-mix(in oklab, ${categoryColor} 12%, transparent)`,
                }}
              >
                {post.category.name}
              </span>
            )}

            {post.isPinned && (
              <Badge tone="warm" size="sm" icon={<Pin className="size-3" aria-hidden />}>
                Kiemelt
              </Badge>
            )}
          </div>
        </div>

        <div className={cn('flex flex-1 flex-col p-4', featured && 'sm:p-6')}>
          <h3
            className={cn(
              'font-semibold text-mist-50 transition-colors duration-fast group-hover:text-tide-200',
              featured ? 'line-clamp-2 text-xl sm:text-2xl' : 'line-clamp-2 text-base',
            )}
          >
            {post.title}
          </h3>

          {post.excerpt && (
            <p
              className={cn(
                'mt-2 text-sm leading-relaxed text-content-muted',
                featured ? 'line-clamp-3' : 'line-clamp-2',
              )}
            >
              {post.excerpt}
            </p>
          )}

          <div className="mt-auto flex items-center gap-3 pt-4">
            {post.author && (
              <Avatar name={post.author.displayName} src={post.author.avatarUrl} size="sm" />
            )}

            <div className="min-w-0 flex-1">
              {post.author && (
                <p className="truncate text-2xs font-medium text-mist-300">
                  {post.author.displayName}
                </p>
              )}
              <p className="flex items-center gap-1.5 text-2xs text-mist-600">
                <time dateTime={toIsoString(post.publishedAt)}>
                  {formatDate(post.publishedAt)}
                </time>
                <span aria-hidden>·</span>
                <span className="nums inline-flex items-center gap-1">
                  <Clock className="size-3" aria-hidden />
                  {post.readingMinutes} perc
                </span>
              </p>
            </div>
          </div>
        </div>
      </Link>
    </article>
  );
}
