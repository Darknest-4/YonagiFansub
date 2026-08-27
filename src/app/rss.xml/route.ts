import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { escapeHtml } from '@/lib/markdown';
import { getSettings } from '@/server/settings';
import { stripMarkdown, truncate } from '@/lib/utils';

export const runtime = 'nodejs';
/*
 * Per request; the `Cache-Control` header below is what actually caches this,
 * and unlike a build-time snapshot it stays correct after a release is
 * published. See `(site)/layout.tsx`.
 */
export const dynamic = 'force-dynamic';

/**
 * RSS feed.
 *
 * Fansub audiences are unusually feed-literate — a reader subscription is often
 * how people actually track releases — so the feed carries both news posts and
 * releases, merged and sorted by date, rather than news alone.
 *
 * Everything interpolated is escaped: a title containing `&` or `<` would
 * otherwise produce invalid XML that readers silently drop.
 */
export async function GET(): Promise<Response> {
  const settings = await getSettings();
  const base = env.NEXT_PUBLIC_SITE_URL;

  const [posts, releases] = await Promise.all([
    db.newsPost.findMany({
      where: { deletedAt: null, status: 'PUBLISHED', publishedAt: { lte: new Date() } },
      select: { slug: true, title: true, excerpt: true, content: true, publishedAt: true },
      orderBy: { publishedAt: 'desc' },
      take: 20,
    }),
    db.release.findMany({
      where: {
        deletedAt: null,
        status: 'PUBLISHED',
        project: { deletedAt: null, publishStatus: 'PUBLISHED' },
      },
      select: {
        id: true,
        version: true,
        resolution: true,
        releasedAt: true,
        episode: { select: { number: true, title: true } },
        project: { select: { slug: true, title: true } },
      },
      orderBy: { releasedAt: 'desc' },
      take: 30,
    }),
  ]);

  const items = [
    ...posts.map((post) => ({
      title: post.title,
      link: `${base}/hirek/${post.slug}`,
      description: post.excerpt ?? truncate(stripMarkdown(post.content), 300),
      date: post.publishedAt ?? new Date(),
      category: 'Hír',
      guid: `${base}/hirek/${post.slug}`,
    })),

    ...releases.map((release) => {
      const episodeLabel = release.episode
        ? `${release.episode.number.toString().replace(/\.00$/, '')}. rész`
        : 'kiadás';

      return {
        title: `${release.project.title} – ${episodeLabel}${release.version > 1 ? ` (v${release.version})` : ''}`,
        link: `${base}/projektek/${release.project.slug}`,
        description: `Új kiadás: ${release.project.title} ${episodeLabel}, ${release.resolution.replace(/^[A-Z]+_/, '').toLowerCase()}.`,
        date: release.releasedAt ?? new Date(),
        category: 'Kiadás',
        // The release id keeps the guid stable even if the project is renamed.
        guid: `${base}/kiadasok#${release.id}`,
      };
    }),
  ]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 40);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeHtml(settings.siteName)}</title>
    <link>${base}</link>
    <description>${escapeHtml(settings.siteDescription)}</description>
    <language>hu-HU</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${base}/rss.xml" rel="self" type="application/rss+xml" />
${items
  .map(
    (item) => `    <item>
      <title>${escapeHtml(item.title)}</title>
      <link>${escapeHtml(item.link)}</link>
      <guid isPermaLink="false">${escapeHtml(item.guid)}</guid>
      <pubDate>${item.date.toUTCString()}</pubDate>
      <category>${escapeHtml(item.category)}</category>
      <description>${escapeHtml(item.description)}</description>
    </item>`,
  )
  .join('\n')}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600',
    },
  });
}
