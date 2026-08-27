import 'server-only';
import { PrismaClient } from '@prisma/client';
import { env, isDevelopment, isProduction } from '@/lib/env';
import { logger } from '@/lib/logger';

/**
 * Prisma client singleton.
 *
 * Next's dev server re-evaluates modules on every hot reload, which would open a
 * new connection pool each time; the global cache prevents pool exhaustion.
 * Slow queries are logged in every environment — a query that crosses the
 * threshold is a missing index until proven otherwise.
 */

const SLOW_QUERY_MS = 300;

function createClient() {
  const client = new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'warn' },
      { emit: 'event', level: 'error' },
    ],
    errorFormat: isProduction ? 'minimal' : 'pretty',
  });

  client.$on('query', (event) => {
    if (event.duration >= SLOW_QUERY_MS) {
      logger.warn('Slow database query', {
        durationMs: event.duration,
        query: isProduction ? undefined : event.query,
        target: event.target,
      });
    }
  });

  client.$on('warn', (event) => logger.warn('Prisma warning', { message: event.message }));
  client.$on('error', (event) => logger.error('Prisma error', new Error(event.message)));

  return client;
}

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

export const db = globalForPrisma.prisma ?? createClient();

if (isDevelopment) {
  globalForPrisma.prisma = db;
}

/** Liveness probe used by `/api/health` and by the container healthcheck. */
export async function checkDatabase(): Promise<{ ok: boolean; latencyMs: number }> {
  const startedAt = performance.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return { ok: true, latencyMs: Math.round(performance.now() - startedAt) };
  } catch (error) {
    logger.error('Database healthcheck failed', error);
    return { ok: false, latencyMs: Math.round(performance.now() - startedAt) };
  }
}

export { env as dbEnv };
