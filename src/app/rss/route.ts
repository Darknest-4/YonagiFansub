import { db } from '@/lib/db';
import { escapeHtml } from '@/lib/markdown';
import { getSettings } from '@/server/settings';
import { siteUrl } from '@/lib/site-url';
import { stripMarkdown, truncate } from '@/lib/utils';
import { CHANGELOG, CHANGE_KIND_LABELS } from '@/content/changelog';

export const runtime = 'nodejs';
/*
 * Per request; the `Cache-Control` header below is what actually caches this,
 * and unlike a build-time snapshot it stays correct after an episode goes out.
 * See `(site)/layout.tsx`.
 */
export const dynamic = 'force-dynamic';

/**
 * The feed.
 *
 * ## `/rss`, not `/rss.xml`
 *
 * The extension said nothing a reader needed and nothing a browser used — the
 * `Content-Type` header is what decides how this is handled, and it is set
 * below. `/rss.xml` now permanently redirects here (see `next.config.ts`) so
 * that nobody's existing subscription breaks: a 301 is what tells a feed reader
 * to store the new address, and simply deleting the old one would have dropped
 * every subscriber silently.
 *
 * ## What is in it
 *
 * Three streams, merged and sorted by date:
 *
 *   • **new episodes** — the thing a fansub audience subscribes for;
 *   • **news posts** — announcements, hiatus notices, project pickups;
 *   • **the development log** — what changed on the site itself.
 *
 * It used to carry news and releases. The release layer is gone, and the
 * episode is the event now; the changelog was added because "the site changed
 * under me" is exactly the kind of thing a returning reader wants told rather
 * than discovered.
 *
 * ## Readable in a browser
 *
 * The `xml-stylesheet` instruction points at `/rss.xsl` — relative, not
 * absolute, and that matters: a browser resolves it against the document's own
 * address, so it is right on every host the feed is served from. Built from the
 * resolved origin it would have been one more thing that could point somewhere
 * the reader cannot reach, which is the class of bug this change exists to
 * remove.
 *
 * Browsers apply the stylesheet and render this as an ordinary page. Feed
 * readers ignore it entirely — it is a
 * processing instruction, not content — so the same URL is a valid RSS 2.0
 * document to a machine and a legible page to a person. That is worth having:
 * somebody who clicks a feed link and gets a wall of angle brackets concludes
 * the link is broken.
 *
 * Everything interpolated is escaped: a title containing `&` or `<` would
 * otherwise produce invalid XML that readers silently drop.
 */

interface FeedItem {
  title: string;
  link: string;
  description: string;
  date: Date;
  category: string;
  guid: string;
}

export async function GET(): Promise<Response> {
  const [settings, base] = await Promise.all([getSettings(), siteUrl()]);

  const [posts, episodes] = await Promise.all([
    db.newsPost.findMany({
      where: { deletedAt: null, status: 'PUBLISHED', publishedAt: { lte: new Date() } },
      select: { slug: true, title: true, excerpt: true, content: true, publishedAt: true },
      orderBy: { publishedAt: 'desc' },
      take: 20,
    }),
    db.episode.findMany({
      where: {
        deletedAt: null,
        status: 'RELEASED',
        releasedAt: { not: null },
        project: { deletedAt: null, publishStatus: 'PUBLISHED' },
      },
      select: {
        id: true,
        number: true,
        title: true,
        synopsis: true,
        releasedAt: true,
        project: { select: { slug: true, title: true } },
      },
      orderBy: { releasedAt: 'desc' },
      take: 30,
    }),
  ]);

  const items: FeedItem[] = [
    ...episodes.map((episode) => {
      const number = episode.number.toString().replace(/\.00$/, '');
      const label = `${number}. rész`;
      const link = `${base}/projektek/${episode.project.slug}/${number}`;

      return {
        title: `${episode.project.title} – ${label}${episode.title ? `: ${episode.title}` : ''}`,
        link,
        description:
          episode.synopsis?.trim() ||
          `Megjelent: ${episode.project.title} ${label}, magyar felirattal.`,
        // Narrowed by the query; the column is nullable so the compiler cannot know.
        date: episode.releasedAt ?? new Date(),
        category: 'Új rész',
        // The episode id, not the URL: a project renamed tomorrow must not make
        // every one of its episodes look like a new item in everyone's reader.
        guid: `${base}/epizod/${episode.id}`,
      };
    }),

    ...posts.map((post) => ({
      title: post.title,
      link: `${base}/hirek/${post.slug}`,
      description: post.excerpt ?? truncate(stripMarkdown(post.content), 300),
      date: post.publishedAt ?? new Date(),
      category: 'Hír',
      guid: `${base}/hirek/${post.slug}`,
    })),

    /*
      The development log, one item per day rather than per change.

      Per change would flood a reader with six entries for one afternoon's work,
      and they are not separately addressable anyway — the page is grouped by
      day. The description lists what happened, prefixed by kind.
    */
    ...(settings.changelogEnabled
      ? CHANGELOG.slice(0, 10).map((entry) => ({
          title: `Fejlesztés: ${entry.title}`,
          link: `${base}/fejlesztes`,
          description: `${entry.summary}\n\n${entry.changes
            .map((change) => `• ${CHANGE_KIND_LABELS[change.kind]} — ${change.title}`)
            .join('\n')}`,
          // Midday rather than midnight: a date with no time is read as UTC
          // midnight, which in Budapest is the previous evening, and the item
          // would appear dated a day early for every Hungarian reader.
          date: new Date(`${entry.date}T12:00:00Z`),
          category: 'Fejlesztés',
          guid: `${base}/fejlesztes#${entry.date}`,
        }))
      : []),
  ]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 40);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/rss.xsl"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeHtml(settings.siteName)}</title>
    <link>${base}</link>
    <description>${escapeHtml(settings.siteDescription)}</description>
    <language>hu-HU</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${base}/rss" rel="self" type="application/rss+xml" />
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
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600',
    },
  });
}
