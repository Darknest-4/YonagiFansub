import type { MetadataRoute } from 'next';
import { getSettings } from '@/server/settings';
import { siteUrl } from '@/lib/site-url';

/*
 * Generated per request rather than at build time: it reads site settings from
 * the database, which `next build` cannot reach. See `(site)/layout.tsx`.
 * The response is cheap and the data comes from the cache, so per-request
 * generation costs a cache read, not a query.
 */
export const dynamic = 'force-dynamic';

/**
 * robots.txt.
 *
 * Driven by the `indexingEnabled` site setting, so a staging deployment can be
 * closed to crawlers from the admin panel rather than by a code change. The
 * disallow list covers everything that is either private or worthless to index:
 * the API, the admin panel, the account area and search result pages.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = await siteUrl();
  const settings = await getSettings();

  if (!settings.indexingEnabled) {
    return {
      rules: [{ userAgent: '*', disallow: '/' }],
      host: base,
    };
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin',
          '/admin/',
          '/profil',
          '/profil/',
          '/belepes',
          '/regisztracio',
          '/jelszo-visszaallitas',
          '/email-megerosites',
          '/kereses',
          '/403',
          '/karbantartas',
        ],
      },
      {
        // Give the big crawlers a slightly wider allowance, but the same limits.
        userAgent: ['Googlebot', 'Bingbot'],
        allow: '/',
        disallow: ['/api/', '/admin', '/profil', '/kereses'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
