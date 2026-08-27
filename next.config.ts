import type { NextConfig } from 'next';

/**
 * Content Security Policy.
 *
 * `'unsafe-inline'` for styles is required by Next's inlined critical CSS and by
 * framer-motion's style writes. Scripts are protected with a per-request nonce in
 * `middleware.ts`; the `strict-dynamic` fallback keeps the policy meaningful on
 * browsers that support it while remaining functional on those that do not.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' https:",
  // No Google Fonts hosts here on purpose. `next/font/google` downloads the
  // font files at build time and serves them from /_next/static/media, so the
  // browser never contacts a third party — verified against the built output,
  // not assumed. Listing hosts we do not use would widen the policy for
  // requests that never happen, which is the opposite of what a CSP is for.
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "upgrade-insecure-requests",
].join('; ');

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
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
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
  },

  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [360, 480, 640, 828, 1080, 1280, 1600, 1920, 2560],
    imageSizes: [16, 32, 48, 64, 96, 128, 192, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    // Remote CDN hosts are configured through env in deployment; the defaults keep
    // the surface small and explicit.
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.yonagifansub.hu' },
      { protocol: 'https', hostname: 'images.yonagifansub.hu' },
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
          ...securityHeaders.filter((header) => header.key !== 'Content-Security-Policy'),
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
    ];
  },
};

export default nextConfig;
