import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Clock, Eye } from 'lucide-react';
import { ogImages, twitterImages } from '@/shared/lib/seo';
import { formatDate, formatCount, truncate, stripMarkdown, toIsoString } from '@/shared/lib/utils';
import { renderMarkdown } from '@/shared/lib/markdown';
import { getPublicNewsBySlug, getRelatedNews, incrementNewsView } from '@/features/news/queries';
import { Breadcrumbs } from '@/shared/layout/page-header';
import { NewsCard } from '@/features/news/components/news-card';
import { Comments } from '@/features/comments/components/comments';
import { Avatar } from '@/shared/ui/avatar';
import { siteUrl } from '@/shared/lib/site-url';

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const base = await siteUrl();
  const { slug } = await params;
  const post = await getPublicNewsBySlug(slug);

  if (!post) return { title: 'Hír nem található', robots: { index: false, follow: false } };

  const description = post.excerpt ?? truncate(stripMarkdown(post.content), 155);

  return {
    title: post.title,
    description,
    alternates: { canonical: `/hirek/${post.slug}` },
    openGraph: {
      type: 'article',
      title: post.title,
      description,
      url: `${base}/hirek/${post.slug}`,
      publishedTime: toIsoString(post.publishedAt),
      modifiedTime: toIsoString(post.updatedAt),
      authors: post.author ? [post.author.displayName] : undefined,
      ...ogImages(post.coverImageUrl, post.title),
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description,
      ...twitterImages(post.coverImageUrl),
    },
  };
}

/**
 * News article.
 *
 * The body is rendered from markdown by our own escape-first renderer
 * (`lib/markdown.ts`), which is why `dangerouslySetInnerHTML` is safe here: the
 * only HTML in that string is HTML the renderer itself emitted.
 */
export default async function NewsPostPage({ params }: { params: Params }) {
  const base = await siteUrl();
  const { slug } = await params;
  const post = await getPublicNewsBySlug(slug);

  if (!post) notFound();

  const [related, { html, headings }] = await Promise.all([
    getRelatedNews(post.id, post.categoryId, 3),
    Promise.resolve(renderMarkdown(post.content)),
  ]);

  void incrementNewsView(post.id);

  const accent = post.category?.color ?? '#f761a8';
  const showToc = headings.filter((heading) => heading.level <= 3).length >= 3;

  return (
    <article className="relative isolate">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'NewsArticle',
            headline: post.title,
            description: post.excerpt ?? undefined,
            image: post.coverImageUrl ?? undefined,
            datePublished: toIsoString(post.publishedAt),
            dateModified: toIsoString(post.updatedAt),
            author: post.author
              ? { '@type': 'Person', name: post.author.displayName }
              : { '@type': 'Organization', name: 'Yonagi Fansub' },
            publisher: {
              '@type': 'Organization',
              name: 'Yonagi Fansub',
              url: base,
            },
            mainEntityOfPage: `${base}/hirek/${post.slug}`,
            inLanguage: 'hu-HU',
          }),
        }}
      />

      <div
        aria-hidden
        className="absolute inset-x-0 top-0 -z-10 h-72"
        style={{
          background: `linear-gradient(180deg, color-mix(in oklab, ${accent} 14%, transparent), transparent)`,
        }}
      />

      <div className="container-content py-8 lg:py-10">
        <Breadcrumbs crumbs={[{ label: 'Hírek', href: '/hirek' }, { label: post.title }]} />

        <header className="mx-auto max-w-prose">
          {post.category && (
            <Link
              href={`/hirek?category=${post.category.slug}`}
              className="inline-flex items-center rounded-full border px-3 py-1 text-2xs font-semibold transition-opacity hover:opacity-80"
              style={{
                color: accent,
                borderColor: `color-mix(in oklab, ${accent} 35%, transparent)`,
                backgroundColor: `color-mix(in oklab, ${accent} 12%, transparent)`,
              }}
            >
              {post.category.name}
            </Link>
          )}

          <h1 className="mt-4 text-3xl leading-tight sm:text-4xl">{post.title}</h1>

          {post.excerpt && (
            <p className="mt-4 text-base leading-relaxed text-mist-300 sm:text-lg">
              {post.excerpt}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-ink-800 pt-5">
            {post.author && (
              <div className="flex items-center gap-2.5">
                <Avatar name={post.author.displayName} src={post.author.avatarUrl} size="md" />
                <div>
                  <p className="text-sm font-medium text-mist-100">
                    {post.author.teamMember ? (
                      <Link
                        href={`/csapat/${post.author.teamMember.slug}`}
                        className="underline-offset-4 transition-colors hover:text-bloom-300 hover:underline"
                      >
                        {post.author.displayName}
                      </Link>
                    ) : (
                      post.author.displayName
                    )}
                  </p>
                  {post.author.teamMember?.tagline && (
                    <p className="text-2xs text-mist-500">{post.author.teamMember.tagline}</p>
                  )}
                </div>
              </div>
            )}

            <div className="ml-auto flex items-center gap-4 text-2xs text-mist-500">
              <time dateTime={toIsoString(post.publishedAt)}>
                {formatDate(post.publishedAt)}
              </time>
              <span className="nums inline-flex items-center gap-1.5">
                <Clock className="size-3.5" aria-hidden />
                {post.readingMinutes} perc olvasás
              </span>
              {post.viewCount > 50 && (
                <span className="nums inline-flex items-center gap-1.5">
                  <Eye className="size-3.5" aria-hidden />
                  {formatCount(post.viewCount)}
                </span>
              )}
            </div>
          </div>
        </header>

        {post.coverImageUrl && (
          <div className="relative mt-8 aspect-16/9 overflow-hidden rounded-2xl border border-ink-800 bg-ink-850">
            <Image
              src={post.coverImageUrl}
              alt=""
              fill
              priority
              sizes="(min-width: 1216px) 1216px, 100vw"
              className="object-cover"
            />
          </div>
        )}

        <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_14rem]">
          <div
            className="prose-yonagi mx-auto w-full max-w-prose"
            dangerouslySetInnerHTML={{ __html: html }}
          />

          {showToc && (
            <aside className="hidden lg:block">
              <nav aria-label="Tartalomjegyzék" className="sticky top-24">
                <h2 className="mb-3 text-2xs font-bold tracking-[0.18em] text-mist-500 uppercase">
                  Tartalom
                </h2>
                <ul className="space-y-2 border-l border-ink-800 pl-4">
                  {headings
                    .filter((heading) => heading.level <= 3)
                    .map((heading) => (
                      <li
                        key={heading.id}
                        style={{ paddingLeft: `${(heading.level - 2) * 0.75}rem` }}
                      >
                        <a
                          href={`#${heading.id}`}
                          className="text-xs leading-relaxed text-mist-400 transition-colors hover:text-bloom-300"
                        >
                          {heading.text}
                        </a>
                      </li>
                    ))}
                </ul>
              </nav>
            </aside>
          )}
        </div>

        <Comments target={{ newsPostId: post.id }} returnTo={`/hirek/${post.slug}`} />

        {related.length > 0 && (
          <section aria-labelledby="related" className="mt-16 border-t border-ink-800 pt-10">
            <h2 id="related" className="mb-6 text-xl">
              További hírek
            </h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((item) => (
                <NewsCard key={item.id} post={item} />
              ))}
            </div>
          </section>
        )}
      </div>
    </article>
  );
}
