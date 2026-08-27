import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // The scrypt tests intentionally run the real cost parameters.
    testTimeout: 20_000,
    env: {
      NODE_ENV: 'test',
      AUTH_SECRET: 'test-secret-value-that-is-long-enough-for-validation-32',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
      // Keep hashing fast in tests; production uses 2^15.
      AUTH_SCRYPT_LOG_N: '13',
      MAIL_DRIVER: 'noop',
      LOG_LEVEL: 'silent',
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // `server-only` throws when imported outside a React Server Component.
      // Tests exercise these modules directly, so it is stubbed out.
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
});
