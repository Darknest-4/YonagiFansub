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

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_DATABASE_URL: z.string().optional(),

  AUTH_SECRET: z
    .string()
    .min(32, 'AUTH_SECRET must be at least 32 characters – generate with `openssl rand -base64 48`'),
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
    throw new Error(`Invalid environment configuration:\n${report}\n`);
  }

  const value = parsed.data;

  // Cross-field invariants that a flat schema cannot express.
  if (value.RATE_LIMIT_DRIVER === 'redis' && !value.REDIS_URL) {
    throw new Error('RATE_LIMIT_DRIVER=redis requires REDIS_URL to be set.');
  }
  if (value.MAIL_DRIVER === 'smtp' && !value.SMTP_HOST) {
    throw new Error('MAIL_DRIVER=smtp requires SMTP_HOST to be set.');
  }
  if (value.MEDIA_DRIVER === 's3' && !value.S3_BUCKET) {
    throw new Error('MEDIA_DRIVER=s3 requires S3_BUCKET to be set.');
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
    throw new Error('NEXT_PUBLIC_SITE_URL must use https:// in production.');
  }

  return value;
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';
