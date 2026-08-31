import type { MetadataRoute } from 'next';
import { getPublicSettings } from '@/server/settings';

export const dynamic = 'force-dynamic';

/**
 * Web app manifest — what makes the site installable.
 *
 * The audience is the argument for this. A fansub is not read once and
 * forgotten: the same people come back every week for the next episode, from a
 * phone, and until now the only way back was a browser tab or a bookmark. An
 * icon on the home screen is the difference between "I'll check later" and
 * being one tap away.
 *
 * ## What it deliberately does not do
 *
 * There is no service worker here, and that is a decision rather than an
 * omission. Offline caching on a site whose entire point is fresh release
 * information is a way to show somebody last week's episode list and have them
 * believe it. Installability is worth having on its own; caching would have to
 * earn its place separately, and a release feed is the worst possible candidate.
 *
 * `display: standalone` drops the browser chrome, which is what makes it feel
 * like an app — and is also why the mobile bottom bar exists: without the
 * browser's own back button, the site's navigation has to stand on its own.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const settings = await getPublicSettings();
  const name = settings.siteName ?? 'Yonagi Fansub';

  return {
    name,
    short_name: 'Yonagi',
    description: settings.siteDescription ?? 'Magyar anime feliratok.',
    start_url: '/',
    // Opening on the catalogue rather than the marketing hero would be wrong:
    // somebody who installed this already knows what the site is.
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#04060d',
    theme_color: '#04060d',
    lang: 'hu',
    dir: 'ltr',
    categories: ['entertainment'],
    /*
      Two variants of each size, not one marked as both.

      A maskable icon is padded so a launcher can crop it to a circle without
      losing the glyph. Shown *un*cropped, that same padding reads as an icon
      that is too small for its tile. They are different drawings for different
      jobs, so they are different files.
    */
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icon-192-maskable.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      // Long-press the installed icon. These are the two things somebody opens
      // the app to do; anything else is a browse, and a browse starts at home.
      { name: 'Legújabb kiadások', url: '/kiadasok' },
      { name: 'Projektek', url: '/projektek' },
    ],
  };
}
