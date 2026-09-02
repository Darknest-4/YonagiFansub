import { getSettings } from '@/features/settings/service';
import { escapeHtml } from '@/shared/lib/markdown';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The stylesheet that makes `/rss` readable in a browser.
 *
 * ## Why this exists
 *
 * A feed URL gets clicked by people, not only by readers. Chrome and Safari
 * dropped their built-in feed previews years ago, so what a person sees when
 * they click "RSS" is a wall of angle brackets — and the reasonable conclusion
 * is that the link is broken. An `xml-stylesheet` instruction fixes that
 * without compromising anything: browsers apply it and render a page, feed
 * readers ignore processing instructions entirely and parse the same document
 * as RSS 2.0. One URL, correct for both.
 *
 * ## Why a route rather than a file in `public/`
 *
 * The `Content-Type` is the whole ballgame. A browser will only apply a
 * stylesheet served as an XML/XSL type, and what a static host guesses from a
 * `.xsl` extension is not something to leave to chance. Serving it from here
 * states it outright. It also lets the page carry the site's own name, read
 * from the settings, rather than a hardcoded one.
 *
 * ## XSLT 1.0
 *
 * That is all any browser implements — no XPath 2.0 functions, no `format-date`.
 * Hence the `substring()` on the RFC-822 `pubDate` rather than real date
 * formatting: `Tue, 02 Sep 2026` is the first sixteen characters of it, which
 * is both correct and the part a reader wants.
 *
 * Styles are inline in the document. The site's own CSS is a Tailwind build
 * whose class names are generated, so linking it would buy nothing; the palette
 * below is copied from `styles/globals.css` so the page still looks like the
 * site it came from. `style-src` allows `'unsafe-inline'` (see `middleware.ts`),
 * so the CSP is satisfied.
 */
export async function GET(): Promise<Response> {
  const settings = await getSettings();
  const siteName = escapeHtml(settings.siteName);

  const xsl = `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:atom="http://www.w3.org/2005/Atom">
  <xsl:output method="html" encoding="UTF-8" indent="yes" />

  <xsl:template match="/rss">
    <html lang="hu">
      <head>
        <title><xsl:value-of select="channel/title" /> — hírfolyam</title>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <style>
          :root {
            color-scheme: dark;
            --ink-950: #0b0713;
            --ink-925: #100b1b;
            --ink-900: #150f22;
            --ink-800: #241a38;
            --ink-700: #33264d;
            --mist-50: #f7f4ff;
            --mist-300: #c3b9d9;
            --mist-500: #8b7fa6;
            --mist-600: #6f6588;
            --bloom-300: #ff9ac6;
            --bloom-400: #f761a8;
            --warning-400: #fbbf24;
          }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 0 1rem 4rem;
            background: var(--ink-950);
            color: var(--mist-300);
            font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
          }
          .wrap { max-width: 46rem; margin: 0 auto; }
          header { padding: 3rem 0 1.5rem; }
          .eyebrow {
            font-size: .7rem; letter-spacing: .18em; text-transform: uppercase;
            color: var(--bloom-400); font-weight: 700; margin: 0 0 .6rem;
          }
          h1 { font-size: clamp(1.75rem, 5vw, 2.5rem); line-height: 1.15; margin: 0 0 .75rem; color: var(--mist-50); }
          .lede { margin: 0; color: var(--mist-500); font-size: .95rem; }
          .note {
            margin: 1.75rem 0 0; padding: .9rem 1.1rem;
            border: 1px solid rgba(251, 191, 36, .25);
            background: rgba(58, 39, 8, .45);
            border-radius: .75rem; font-size: .82rem; color: var(--mist-300);
          }
          .note strong { color: var(--warning-400); }
          .note code {
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            font-size: .95em; color: var(--mist-50);
            background: var(--ink-800); padding: .1rem .4rem; border-radius: .3rem;
            word-break: break-all;
          }
          ol { list-style: none; margin: 2.5rem 0 0; padding: 0; }
          li + li { margin-top: .75rem; }
          article {
            border: 1px solid var(--ink-800); background: rgba(21, 15, 34, .55);
            border-radius: .85rem; padding: 1.1rem 1.25rem;
          }
          .meta { display: flex; flex-wrap: wrap; gap: .6rem; align-items: center; margin-bottom: .5rem; }
          .cat {
            font-size: .65rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase;
            color: var(--bloom-300); background: rgba(247, 97, 168, .12);
            border: 1px solid rgba(247, 97, 168, .25);
            border-radius: 999px; padding: .15rem .6rem;
          }
          time { font-size: .72rem; color: var(--mist-600); }
          h2 { font-size: 1.02rem; margin: 0 0 .4rem; line-height: 1.35; }
          h2 a { color: var(--mist-50); text-decoration: none; }
          h2 a:hover { color: var(--bloom-300); text-decoration: underline; text-underline-offset: 4px; }
          p.desc { margin: 0; font-size: .87rem; color: var(--mist-500); white-space: pre-line; }
          footer { margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid var(--ink-800); font-size: .78rem; color: var(--mist-600); }
          footer a { color: var(--bloom-300); }
          .empty { margin-top: 2.5rem; color: var(--mist-500); }
        </style>
      </head>

      <body>
        <div class="wrap">
          <header>
            <p class="eyebrow">Hírfolyam</p>
            <h1><xsl:value-of select="channel/title" /></h1>
            <p class="lede"><xsl:value-of select="channel/description" /></p>

            <div class="note">
              <strong>Ez egy RSS-hírfolyam.</strong>
              Most azért látod rendes oldalként, mert böngészővel nyitottad meg.
              Ha követni szeretnéd, másold be ezt a címet a hírolvasódba:
              <code><xsl:value-of select="channel/atom:link/@href" /></code>
              — új rész, hír és fejlesztés is megjelenik benne.
            </div>
          </header>

          <xsl:choose>
            <xsl:when test="channel/item">
              <ol>
                <xsl:for-each select="channel/item">
                  <li>
                    <article>
                      <div class="meta">
                        <span class="cat"><xsl:value-of select="category" /></span>
                        <time><xsl:value-of select="substring(pubDate, 1, 16)" /></time>
                      </div>
                      <h2>
                        <a href="{link}"><xsl:value-of select="title" /></a>
                      </h2>
                      <p class="desc"><xsl:value-of select="description" /></p>
                    </article>
                  </li>
                </xsl:for-each>
              </ol>
            </xsl:when>
            <xsl:otherwise>
              <p class="empty">A hírfolyam jelenleg üres. Nézz vissza később.</p>
            </xsl:otherwise>
          </xsl:choose>

          <footer>
            <a href="{channel/link}">Vissza a ${siteName} oldalára</a>
          </footer>
        </div>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>`;

  return new Response(xsl, {
    headers: {
      // `text/xsl` is what every browser that implements XSLT accepts. The
      // registered type `application/xslt+xml` is the more correct one on
      // paper and the less well supported one in practice.
      'Content-Type': 'text/xsl; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
