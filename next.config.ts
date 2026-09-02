import type { NextConfig } from 'next';

/**
 * A Content Security Policy NEM itt van, hanem a `src/middleware.ts`-ben.
 *
 * Oka: a `script-src` nonce-t hordoz, amit kérésenként kell generálni — egy
 * statikus fejléc erre képtelen. Ha itt is beállítanánk, felülírná a
 * middleware kérésenkénti fejlécét (a config fejlécei a handler után kerülnek
 * a válaszra), és a nonce elveszne.
 *
 * Az `/uploads/:path*` a kivétel: a middleware nem fut rá, és ott a
 * legszigorúbb szabály kell, nem a nonce-os.
 */

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,

  /**
   * Emit `.next/standalone`: a self-contained server with only the modules it
   * actually imports, so the runtime image carries no `node_modules` tree and
   * no build tooling.
   *
   * The Dockerfile has copied `.next/standalone` since it was written; this
   * option is what produces it. Without it the directory simply does not exist
   * and the image build fails at the `COPY`. Nothing caught that, because the
   * `docker` CI job only runs on pushes to `main` — so the first real image
   * build was the deploy itself.
   *
   * `public/` and `.next/static` are deliberately NOT included in the
   * standalone output by Next; the Dockerfile copies them separately, which is
   * why `public/.gitkeep` is tracked (git stores no empty directories, and a
   * missing `public/` fails the same `COPY`).
   */
  output: 'standalone',

  // Fail the production build on type or lint errors instead of shipping them.
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },

  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns', 'framer-motion'],

    /*
      Cross-fades between routes instead of a hard swap.

      Every page here is `force-dynamic`, so a navigation always waits on the
      server — tens of milliseconds locally, more over mobile data. The
      `loading.tsx` files fill that gap with a skeleton; this makes the two
      swaps either side of it fade rather than snap, which is the difference
      between "loading" and "flickering".

      Browsers without the View Transitions API ignore it and get the old
      behaviour, so there is nothing to feature-detect.
    */
    viewTransition: true,
  },

  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [360, 480, 640, 828, 1080, 1280, 1600, 1920, 2560],
    imageSizes: [16, 32, 48, 64, 96, 128, 192, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    /*
      Remote hosts are an allow-list, so every host that can appear in an
      `<Image src>` has to be named here — an unlisted one is answered with a
      400 by the optimizer and renders as a broken image.

      The AniList and MyAnimeList CDNs are on the list because the metadata
      importer writes their URLs straight into `coverImageUrl` and
      `bannerImageUrl`. Without them, every imported project would show a hole
      where its artwork should be. Own CDNs stay first; the list is still an
      allow-list, not a wildcard.
    */
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.yonagifansub.hu' },
      { protocol: 'https', hostname: 'images.yonagifansub.hu' },
      // AniList
      { protocol: 'https', hostname: 's4.anilist.co' },
      { protocol: 'https', hostname: 'img.anili.st' },
      // MyAnimeList, via Jikan
      { protocol: 'https', hostname: 'cdn.myanimelist.net' },
      { protocol: 'https', hostname: 'api-cdn.myanimelist.net' },
    ],
  },

  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        /*
         * No blanket `Cache-Control` here on purpose. A rule in this file is
         * applied to the response after the handler has run and wins over what
         * the handler set, so a `no-store` here would silently void the
         * `cache: { sMaxAge: … }` that ten public read endpoints declare — the
         * whole CDN caching layer, disabled by one line nobody would connect to
         * it. `defineRoute` makes the decision per endpoint instead: `no-store`
         * by default (see `jsonOk`), a public value only for a cacheable GET
         * with no session attached.
         */
        source: '/api/:path*',
        headers: securityHeaders,
      },
      {
        /*
         * User-uploaded media. The upload route only stores files whose magic
         * bytes identify them as one of five image formats, and the serving
         * route sets the type from an extension allowlist — but this is the
         * one path where bytes a person supplied come back out over our own
         * origin, so the policy is tightened rather than inherited: nothing
         * loads, nothing executes, and the sandbox denies script and same-origin
         * access even if a response were ever mistyped.
         */
        source: '/uploads/:path*',
        headers: [
          ...securityHeaders,
          { key: 'Content-Security-Policy', value: "default-src 'none'; sandbox" },
        ],
      },
    ];
  },

  async redirects() {
    return [
      { source: '/projects', destination: '/projektek', permanent: true },
      { source: '/news', destination: '/hirek', permanent: true },
      { source: '/team', destination: '/csapat', permanent: true },
      { source: '/login', destination: '/belepes', permanent: true },
      /*
        A hírfolyam elvesztette az `.xml` végét: a kiterjesztés semmit nem
        mondott, amit a `Content-Type` fejléc ne mondana el pontosabban.

        Állandó átirányítás, nem törlés. Egy hírolvasó a 301-re eltárolja az új
        címet; a régi cím puszta megszüntetése minden feliratkozót némán
        leejtett volna.
      */
      { source: '/rss.xml', destination: '/rss', permanent: true },
    ];
  },
};

export default nextConfig;
