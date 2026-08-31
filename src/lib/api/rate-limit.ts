import 'server-only';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { RateLimitError } from '@/lib/errors';
import { optionalImport } from '@/lib/optional-module';

/**
 * Rate limiting.
 *
 * A fixed-window counter behind a driver interface. The in-memory driver is
 * correct for a single instance (the default deployment); `RATE_LIMIT_DRIVER=redis`
 * swaps in a shared store when the app is scaled horizontally, without touching
 * a single call site.
 *
 * Windows are deliberately short and per-action rather than one global bucket:
 * a burst of project-page views must never consume a user's login budget.
 */

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

export interface RateLimitRule {
  /** Requests permitted per window. */
  limit: number;
  /** Window length in seconds. */
  windowSec: number;
}

/**
 * Named policies. Keeping them in one table makes the security posture
 * reviewable at a glance instead of scattered across route files.
 */
export const RATE_LIMITS = {
  'auth:login': { limit: 8, windowSec: 300 },
  'auth:register': { limit: 5, windowSec: 3600 },
  'auth:password-forgot': { limit: 4, windowSec: 3600 },
  'auth:password-reset': { limit: 6, windowSec: 3600 },
  'auth:verify': { limit: 10, windowSec: 3600 },
  // Tighter than the reset: this one sends mail to an address the caller typed,
  // so an unlimited version is a way to have somebody's inbox filled for them.
  'auth:verify-resend': { limit: 3, windowSec: 3600 },
  'contact:submit': { limit: 3, windowSec: 3600 },
  'comment:create': { limit: 12, windowSec: 600 },
  // A lejátszó ritkítva jelent, de egy hosszú film alatt így is sokszor. Bőven
  // a valós forgalom fölött, jóval a visszaélés alatt.
  'watch:progress': { limit: 120, windowSec: 600 },
  'rating:write': { limit: 30, windowSec: 3600 },
  'search:query': { limit: 60, windowSec: 60 },
  'download:resolve': { limit: 60, windowSec: 300 },
  'api:read': { limit: 240, windowSec: 60 },
  'api:write': { limit: 60, windowSec: 60 },
  'admin:write': { limit: 120, windowSec: 60 },
  /*
    Protected playback.

    A 10-second segment means roughly 6 requests a minute per rendition, and a
    player that switches quality or seeks a few times might briefly do several
    times that. 240/minute leaves normal viewing — including seeking — untouched
    while a scraper pulling a 24-minute episode as fast as it can hits the limit
    within seconds. The bucket is per viewer *and* per video, so watching two
    episodes in two tabs does not throttle either.
  */
  'video:manifest': { limit: 30, windowSec: 60 },
  'video:segment': { limit: 240, windowSec: 60 },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitKey = keyof typeof RATE_LIMITS;

interface RateLimitDriver {
  hit(key: string, rule: RateLimitRule): Promise<RateLimitResult>;
  reset(key: string): Promise<void>;
}

// ── In-memory driver ─────────────────────────────────────────────────────────

interface Bucket {
  count: number;
  resetAt: number;
}

class MemoryDriver implements RateLimitDriver {
  private readonly buckets = new Map<string, Bucket>();
  private lastSweep = Date.now();

  private sweep(now: number) {
    // Amortised cleanup: at most once a minute, so the map cannot grow forever
    // under key churn (one key per IP per action).
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }

  async hit(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const now = Date.now();
    this.sweep(now);

    const existing = this.buckets.get(key);
    const bucket =
      existing && existing.resetAt > now
        ? existing
        : { count: 0, resetAt: now + rule.windowSec * 1000 };

    bucket.count += 1;
    this.buckets.set(key, bucket);

    const allowed = bucket.count <= rule.limit;
    return {
      allowed,
      limit: rule.limit,
      remaining: Math.max(0, rule.limit - bucket.count),
      resetAt: bucket.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  async reset(key: string): Promise<void> {
    this.buckets.delete(key);
  }
}

// ── Redis driver ─────────────────────────────────────────────────────────────

/**
 * Minimal Redis driver over the REST-less `node-redis` client, loaded lazily so
 * that memory-driver deployments never pay for the dependency. Falls back to the
 * memory driver if the connection cannot be established — a rate limiter that
 * throws would take the whole site down, which is a worse outcome than a
 * per-instance limit.
 */
class RedisDriver implements RateLimitDriver {
  private client: unknown;
  private readonly fallback = new MemoryDriver();

  private async connect(): Promise<{
    eval: (script: string, options: { keys: string[]; arguments: string[] }) => Promise<unknown>;
    del: (key: string) => Promise<unknown>;
  } | null> {
    if (this.client) {
      return this.client as never;
    }
    try {
      const redis = await optionalImport<{
        createClient: (options: { url: string }) => {
          connect(): Promise<unknown>;
          on(event: string, handler: (error: unknown) => void): unknown;
        };
      }>('redis');

      if (!redis) {
        logger.error('RATE_LIMIT_DRIVER=redis but the `redis` package is not installed.');
        return null;
      }

      const client = redis.createClient({ url: env.REDIS_URL! });
      client.on('error', (error) => logger.error('Redis error', error));
      await client.connect();
      this.client = client;
      return client as never;
    } catch (error) {
      logger.error('Redis rate-limit driver unavailable, falling back to memory', error);
      return null;
    }
  }

  async hit(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const client = await this.connect();
    if (!client) return this.fallback.hit(key, rule);

    // INCR + EXPIRE atomically; returns [count, ttl].
    const script = `
      local current = redis.call('INCR', KEYS[1])
      if current == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
      return { current, redis.call('TTL', KEYS[1]) }
    `;

    try {
      const [count, ttl] = (await client.eval(script, {
        keys: [key],
        arguments: [String(rule.windowSec)],
      })) as [number, number];

      const retryAfterSeconds = Math.max(1, ttl);
      return {
        allowed: count <= rule.limit,
        limit: rule.limit,
        remaining: Math.max(0, rule.limit - count),
        resetAt: Date.now() + retryAfterSeconds * 1000,
        retryAfterSeconds,
      };
    } catch (error) {
      logger.error('Redis rate-limit hit failed', error);
      return this.fallback.hit(key, rule);
    }
  }

  async reset(key: string): Promise<void> {
    const client = await this.connect();
    if (!client) return this.fallback.reset(key);
    await client.del(key).catch(() => undefined);
  }
}

const globalForRateLimit = globalThis as unknown as { rateLimitDriver?: RateLimitDriver };

const driver: RateLimitDriver =
  globalForRateLimit.rateLimitDriver ??
  (env.RATE_LIMIT_DRIVER === 'redis' ? new RedisDriver() : new MemoryDriver());

globalForRateLimit.rateLimitDriver = driver;

/** Records a hit and returns the verdict without throwing. */
export async function checkRateLimit(
  action: RateLimitKey,
  identifier: string,
): Promise<RateLimitResult> {
  return driver.hit(`rl:${action}:${identifier}`, RATE_LIMITS[action]);
}

/** Records a hit and throws `RateLimitError` when the budget is exhausted. */
export async function enforceRateLimit(
  action: RateLimitKey,
  identifier: string,
): Promise<RateLimitResult> {
  const result = await checkRateLimit(action, identifier);
  if (!result.allowed) {
    logger.warn('Rate limit exceeded', { action, identifier: identifier.slice(0, 16) });
    throw new RateLimitError(result.retryAfterSeconds);
  }
  return result;
}

/** Clears a bucket – called after a successful login so a typo costs nothing. */
export async function clearRateLimit(action: RateLimitKey, identifier: string): Promise<void> {
  await driver.reset(`rl:${action}:${identifier}`);
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
  };
}
