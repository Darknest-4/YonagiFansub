import 'server-only';
import { z } from 'zod';

/**
 * Environment contract.
 *
 * Parsed once, at module load, on the server only. A malformed environment fails
 * the process immediately with a readable report instead of surfacing as a
 * mysterious runtime error three layers deep.
 */

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  NEXT_PUBLIC_SITE_URL: z
    .string()
    .url()
    .default('http://localhost:3000')
    .transform((v) => v.replace(/\/$/, '')),

  DATABASE_URL: z.string({
    required_error:
      'DATABASE_URL hiányzik. Ez a PostgreSQL kapcsolati sztring, pl. postgresql://user:jelszo@host:5432/adatbazis',
  }).min(1, 'DATABASE_URL nem lehet üres.'),
  DIRECT_DATABASE_URL: z.string().optional(),

  /*
   * A hibaüzenet szándékosan bőbeszédű: ez az egyetlen változó, ami nélkül a
   * folyamat el sem indul, és az üzenet olyan naplóban jelenik meg, ahol nincs
   * kihez fordulni. A `min(32)` üzenete csak túl rövid értékre szólal meg —
   * ha a változó teljesen hiányzik, a Zod „Kötelező mező."-t adna, ezért a
   * `required_error` külön meg van adva.
   */
  AUTH_SECRET: z
    .string({
      required_error:
        'AUTH_SECRET hiányzik. Generálj egyet: openssl rand -base64 48 — majd állítsd be a szolgáltatásod környezeti változói között (Render: Service → Environment).',
    })
    .min(
      32,
      'AUTH_SECRET túl rövid: legalább 32 karakter kell. Generálj egyet: openssl rand -base64 48',
    ),
  AUTH_SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(14),
  AUTH_SESSION_ABSOLUTE_TTL_DAYS: z.coerce.number().int().min(1).max(730).default(90),
  AUTH_SCRYPT_LOG_N: z.coerce.number().int().min(12).max(20).default(15),

  RATE_LIMIT_DRIVER: z.enum(['memory', 'redis']).default('memory'),
  REDIS_URL: z.string().optional(),

  MAIL_DRIVER: z.enum(['console', 'smtp', 'noop']).default('console'),
  MAIL_FROM: z.string().default('Yonagi Fansub <noreply@yonagifansub.hu>'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),

  /**
   * Upstream metadata APIs.
   *
   * Configurable rather than hard-coded so an instance can point at a mirror, a
   * caching proxy, or a self-hosted Jikan — all three are ordinary deployments
   * for a site that syncs on a schedule, and a network that blocks the public
   * hosts would otherwise leave the feature dead with no way to redirect it.
   */
  /**
   * User-Agent sent to the metadata APIs.
   *
   * Configurable because AniList sits behind Cloudflare, which sometimes refuses
   * a request on the strength of its agent string alone — and the refusal looks
   * identical to the service being down. Being able to change it without a
   * deploy is the difference between a five-minute fix and a day of guessing.
   * A contact URL is conventional and makes a block less likely, not more.
   */
  METADATA_USER_AGENT: z
    .string()
    .min(3)
    .default('YonagiFansub/1.0 (+https://github.com/Darknest-4/YonagiFansub)'),

  ANILIST_API_URL: z.string().url().default('https://graphql.anilist.co'),
  JIKAN_API_URL: z.string().url().default('https://api.jikan.moe/v4'),
  /** Projects refreshed per scheduled run. Keeps the run inside the rate limits. */
  METADATA_SYNC_BATCH: z.coerce.number().int().min(1).max(200).default(20),

  MEDIA_DRIVER: z.enum(['local', 's3']).default('local'),
  MEDIA_PUBLIC_BASE_URL: z.string().default('/uploads'),
  /**
   * Where the local driver writes. Deliberately outside `public/`: Next builds
   * its static-file manifest at build time, so a file dropped into `public/` at
   * runtime is on disk but returns 404. Uploads are served by the
   * `/uploads/[...path]` route instead, which reads this directory live — and
   * that also keeps user content out of the build output and out of the image.
   */
  MEDIA_LOCAL_DIR: z.string().default('./storage/uploads'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
  /**
   * Sentry-compatible DSN. Unset means errors go to the log and nowhere else,
   * which is the correct default for development. See `lib/error-reporting.ts`.
   */
  ERROR_REPORTING_DSN: z.string().url().optional().or(z.literal('').transform(() => undefined)),
});

type Env = z.infer<typeof schema>;

function loadEnv(): Env {
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    const report = parsed.error.issues
      .map((issue) => `  • ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Hibás környezeti konfiguráció:\n${report}\n\n` +
        'A hiányzó értékeket a szolgáltatásod környezeti változói között kell megadni\n' +
        '(Render: Service → Environment; Docker: -e / docker-compose environment).\n',
    );
  }

  const value = parsed.data;

  // Cross-field invariants that a flat schema cannot express.
  if (value.RATE_LIMIT_DRIVER === 'redis' && !value.REDIS_URL) {
    throw new Error('RATE_LIMIT_DRIVER=redis mellett a REDIS_URL is kötelező.');
  }
  if (value.MAIL_DRIVER === 'smtp' && !value.SMTP_HOST) {
    throw new Error('MAIL_DRIVER=smtp mellett az SMTP_HOST is kötelező.');
  }
  if (value.MEDIA_DRIVER === 's3' && !value.S3_BUCKET) {
    throw new Error('MEDIA_DRIVER=s3 mellett az S3_BUCKET is kötelező.');
  }
  /*
   * `next build` runs with NODE_ENV=production even on a laptop or in CI, where
   * the site URL is legitimately http://localhost. Enforcing https during the
   * build would make every local production build fail for a reason that has
   * nothing to do with the build. The check belongs at boot, where the value is
   * the one the server will actually serve under.
   */
  const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';

  if (
    value.NODE_ENV === 'production' &&
    !isBuildPhase &&
    value.NEXT_PUBLIC_SITE_URL.startsWith('http://') &&
    !value.NEXT_PUBLIC_SITE_URL.startsWith('http://localhost')
  ) {
    throw new Error(
      'A NEXT_PUBLIC_SITE_URL élesben https:// kell legyen — a __Host- előtagú sütik és a HSTS ezt követelik.',
    );
  }

  return value;
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';
