import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Integration tests — the ones that need a real Postgres.
 *
 * A separate config rather than a tag inside the unit suite, because these have
 * requirements the unit suite must never inherit: a live database, the SQL that
 * `prisma migrate` cannot express, and files that run one at a time.
 *
 * `npm test` stays what it is — no infrastructure, seconds to run, safe on any
 * checkout. `npm run test:integration` is the one that needs a database, and
 * says so when it does not have one.
 */

const url = process.env.TEST_DATABASE_URL;

if (!url) {
  console.warn(
    '\n  TEST_DATABASE_URL nincs beállítva — az integrációs tesztek kimaradnak.' +
      '\n  Példa: TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/yonagi_test npm run test:integration\n',
  );
}

export default defineConfig({
  test: {
    environment: 'node',
    // Zero tests rather than a failure when there is no database: a checkout
    // that never configured one should not look broken.
    include: url ? ['tests/integration/**/*.test.ts'] : [],
    // Only forgiving in that case. With a database configured, "no test files"
    // means a broken glob, and that should still fail.
    passWithNoTests: !url,
    globalSetup: url ? ['tests/integration/global-setup.ts'] : [],
    setupFiles: url ? ['tests/integration/setup.ts'] : [],

    // One database, shared by every file. Parallel files would truncate each
    // other's rows mid-assertion, and the failures would look like flakes.
    fileParallelism: false,

    // Migrations run before the first file; scrypt runs at real cost in the
    // auth tests.
    testTimeout: 30_000,
    hookTimeout: 120_000,

    env: {
      NODE_ENV: 'test',
      AUTH_SECRET: 'test-secret-value-that-is-long-enough-for-validation-32',
      // The app's own client reads this, so the modules under test connect to
      // the test database without any of them knowing they are being tested.
      DATABASE_URL: url ?? 'postgresql://unset:unset@localhost:5432/unset_test',
      NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
      AUTH_SCRYPT_LOG_N: '13',
      MAIL_DRIVER: 'noop',
      LOG_LEVEL: 'silent',
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
});
