import 'server-only';

/**
 * Shared HTTP plumbing for the upstream metadata APIs.
 *
 * Both AniList and Jikan publish hard rate limits and both answer a breach with
 * a 429 rather than a queue, so the limits are respected here rather than hoped
 * for at the call sites. Two mechanisms, because they solve different problems:
 *
 *   • A **per-host minimum gap** between requests, so a burst is spread out
 *     instead of being fired all at once and then apologised for.
 *   • **Retry with backoff on 429 and 5xx**, honouring `Retry-After` when the
 *     server states one — guessing an interval when the server has told you the
 *     answer is how a client gets itself banned.
 *
 * The gap is enforced with a per-host promise chain rather than a timer, so
 * concurrent callers queue behind each other instead of all sleeping the same
 * amount and colliding anyway.
 */

export class UpstreamError extends Error {
  readonly status: number;
  readonly host: string;

  constructor(message: string, options: { status: number; host: string }) {
    super(message);
    this.name = 'UpstreamError';
    this.status = options.status;
    this.host = options.host;
  }

  /** True when retrying later could plausibly succeed. */
  get isTransient(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

/** Tail of the in-flight queue per host, so requests serialise with a gap. */
const queues = new Map<string, Promise<void>>();

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs `task` after waiting for this host's turn.
 *
 * Failures are swallowed into the chain deliberately: one request erroring must
 * not poison the queue for every request behind it.
 */
function schedule<T>(host: string, gapMs: number, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(host) ?? Promise.resolve();
  const ready = previous.then(() => delay(gapMs));

  queues.set(
    host,
    ready.catch(() => undefined),
  );

  return ready.then(task);
}

export interface UpstreamRequest {
  host: string;
  url: string;
  /** Minimum milliseconds between two requests to this host. */
  gapMs: number;
  init?: RequestInit;
  /** Total attempts, including the first. */
  attempts?: number;
  timeoutMs?: number;
}

export async function upstreamFetch<T>({
  host,
  url,
  gapMs,
  init,
  attempts = 3,
  timeoutMs = 15_000,
}: UpstreamRequest): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await schedule(host, gapMs, async () => {
        // An upstream that never answers must not hold a request handler open
        // until the platform kills it.
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          return await fetch(url, {
            ...init,
            signal: controller.signal,
            headers: {
              Accept: 'application/json',
              'User-Agent': 'YonagiFansub/1.0 (+metadata-sync)',
              ...init?.headers,
            },
            // Upstream metadata is fetched on demand and cached in our own
            // database; Next's fetch cache would only add a second, invisible
            // layer with its own staleness.
            cache: 'no-store',
          });
        } finally {
          clearTimeout(timer);
        }
      });

      if (response.ok) return (await response.json()) as T;

      const error = new UpstreamError(
        `${host} válasza: HTTP ${response.status}`,
        { status: response.status, host },
      );

      if (!error.isTransient || attempt === attempts) throw error;

      // `Retry-After` is the server telling us exactly how long to wait. Ignoring
      // it in favour of our own backoff is how a client earns a longer ban.
      const stated = Number(response.headers.get('retry-after'));
      const backoff = Number.isFinite(stated) && stated > 0 ? stated * 1000 : 2 ** attempt * 500;
      await delay(Math.min(backoff, 30_000));
      lastError = error;
      continue;
    } catch (error) {
      if (error instanceof UpstreamError) {
        if (!error.isTransient || attempt === attempts) throw error;
        lastError = error;
        continue;
      }

      // Network failure or timeout: retryable, but not past the last attempt.
      lastError = error;
      if (attempt === attempts) break;
      await delay(2 ** attempt * 500);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new UpstreamError(`${host} nem válaszolt.`, { status: 503, host });
}
