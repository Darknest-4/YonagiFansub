import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';
import { getSettings } from '@/server/settings';

export const revalidate = 3600;

/**
 * robots.txt.
 *
 * Driven by the `indexingEnabled` site setting, so a staging deployment can be
 * closed to crawlers from the admin panel rather than by a code change. The
 * disallow list covers everything that is either private or worthless to index:
 * the API, the admin panel, the account area and search result pages.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const settings = await getSettings();

  if (!settings.indexingEnabled) {
    return {
      rules: [{ userAgent: '*', disallow: '/' }],
      host: env.NEXT_PUBLIC_SITE_URL,
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
    sitemap: `${env.NEXT_PUBLIC_SITE_URL}/sitemap.xml`,
    host: env.NEXT_PUBLIC_SITE_URL,
  };
}
