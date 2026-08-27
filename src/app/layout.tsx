import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono, Noto_Sans_JP, Sora } from 'next/font/google';
import { env } from '@/lib/env';
import { getPublicSettings } from '@/server/settings';
import { AppProviders } from '@/components/providers';
import { cn } from '@/lib/utils';
import '@/styles/globals.css';

/**
 * Root layout.
 *
 * Fonts are self-hosted through `next/font` — no request to a third-party
 * origin, no FOUT, and `display: swap` with a metric-matched fallback so the
 * layout does not shift when the real face lands.
 */

const sora = Sora({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-sora',
  display: 'swap',
  weight: ['400', '600', '700', '800'],
});

const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono-jb',
  display: 'swap',
  weight: ['400', '500', '600'],
});

const notoSansJp = Noto_Sans_JP({
  subsets: ['latin'],
  variable: '--font-noto-jp',
  display: 'swap',
  weight: ['400', '700'],
  preload: false, // Only used for accent text; never worth blocking on.
});

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#04060d' },
    { media: '(prefers-color-scheme: light)', color: '#04060d' },
  ],
  width: 'device-width',
  initialScale: 1,
  // Zoom stays enabled: disabling it is an accessibility failure, not a polish.
  maximumScale: 5,
  colorScheme: 'dark',
};

/**
 * Nothing in this application is prerendered at build time.
 *
 * The declaration belongs here, on the root layout, because the reason is here:
 * `generateMetadata` below reads the site name, tagline and description from the
 * database, so **every** page in the app — the login form included — depends on
 * a query before it can render its `<head>`. `next build` runs inside an image
 * builder with no database reachable, which makes prerendering not a trade-off
 * but a build that cannot finish. It failed exactly that way on Render, 29 pages
 * into `Generating static pages`, and putting the declaration on a route group
 * was not enough: the dependency is above every group.
 *
 * Nothing is lost. Response speed comes from the data cache (`unstable_cache` +
 * `revalidateTag`, see `lib/cache.ts`), which serves these pages from memory and
 * is invalidated the moment an editor publishes. A build-time snapshot would be
 * strictly worse — stale from the first release, refreshable only by redeploying.
 *
 * Route handlers do not inherit layout config, so `app/api/**`, `sitemap.ts`,
 * `robots.ts`, `rss.xml` and `opengraph-image.tsx` each carry their own marker.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPublicSettings();
  const siteName = settings.siteName ?? 'Yonagi Fansub';
  const description = settings.siteDescription ?? '';

  return {
    metadataBase: new URL(env.NEXT_PUBLIC_SITE_URL),
    title: {
      default: `${siteName} — ${settings.siteTagline ?? 'Magyar anime feliratok'}`,
      template: `%s · ${siteName}`,
    },
    description,
    applicationName: siteName,
    referrer: 'strict-origin-when-cross-origin',
    keywords: [
      'anime',
      'fansub',
      'magyar felirat',
      'anime felirat',
      'yonagi',
      'anime letöltés',
    ],
    authors: [{ name: siteName, url: env.NEXT_PUBLIC_SITE_URL }],
    creator: siteName,
    publisher: siteName,
    formatDetection: { email: false, address: false, telephone: false },
    alternates: {
      canonical: '/',
      types: { 'application/rss+xml': `${env.NEXT_PUBLIC_SITE_URL}/rss.xml` },
    },
    openGraph: {
      type: 'website',
      locale: 'hu_HU',
      url: env.NEXT_PUBLIC_SITE_URL,
      siteName,
      title: `${siteName} — ${settings.siteTagline ?? ''}`.trim(),
      description,
      images: settings.ogImageUrl
        ? [{ url: settings.ogImageUrl, width: 1200, height: 630, alt: siteName }]
        : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: siteName,
      description,
      images: settings.ogImageUrl ? [settings.ogImageUrl] : undefined,
    },
    robots: settings.indexingEnabled
      ? {
          index: true,
          follow: true,
          googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
        }
      : { index: false, follow: false },
    icons: {
      icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
      apple: '/apple-icon.png',
    },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = await getPublicSettings();

  return (
    <html
      lang="hu"
      suppressHydrationWarning
      className={cn(sora.variable, inter.variable, jetbrainsMono.variable, notoSansJp.variable)}
    >
      <body className="min-h-dvh bg-canvas font-sans text-content antialiased">
        {/* First tab stop on every page. */}
        <a
          href="#main"
          className="sr-only-focusable fixed top-4 left-4 z-300 rounded-lg bg-tide-400 px-4 py-2.5 text-sm font-semibold text-ink-950 shadow-e3"
        >
          Ugrás a tartalomra
        </a>

        <AppProviders settings={settings}>{children}</AppProviders>
      </body>
    </html>
  );
}
