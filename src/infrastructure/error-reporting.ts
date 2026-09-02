import 'server-only';
import { env, isProduction } from '@/infrastructure/env';

/**
 * Error reporting sink.
 *
 * `ERROR_REPORTING_DSN` used to be configuration nothing read — a promise the
 * system did not keep. This forwards errors to a Sentry-compatible collector
 * when a DSN is set, and does nothing at all when it is not.
 *
 * The Sentry envelope protocol is used directly rather than through the SDK.
 * The SDK's value is automatic instrumentation — breadcrumbs, tracing, source
 * maps — and we already have structured request logging with request ids. What
 * was missing was a place errors go where someone will see them, and that is one
 * HTTP POST.
 *
 * Three rules this must never break, because an error reporter that takes the
 * site down is worse than no error reporter:
 *
 * 1. It never throws. Every failure path is swallowed.
 * 2. It never blocks a response. The request is fire-and-forget with a timeout.
 * 3. It never sends anything the logger would have redacted — the payload is
 *    built from an already-redacted context.
 */

interface Dsn {
  envelopeUrl: string;
  publicKey: string;
}

/**
 * Parses `https://{publicKey}@{host}/{projectId}` into the envelope endpoint.
 * Returns null for anything malformed: a typo'd DSN must degrade to "no
 * reporting", never to a crash at import time.
 */
export function parseDsn(dsn: string): Dsn | null {
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\/+/, '');
    if (!url.username || !projectId) return null;

    return {
      envelopeUrl: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
      publicKey: url.username,
    };
  } catch {
    return null;
  }
}

const parsed = env.ERROR_REPORTING_DSN ? parseDsn(env.ERROR_REPORTING_DSN) : null;

export interface ReportInput {
  message: string;
  error?: unknown;
  /** Already redacted by the logger before it reaches here. */
  context?: Record<string, unknown>;
}

/** The three newline-delimited JSON objects a Sentry envelope is made of. */
export function buildEnvelope(input: ReportInput, eventId: string, sentAt: string): string {
  const error = input.error;
  const isError = error instanceof Error;

  const event = {
    event_id: eventId,
    timestamp: Date.parse(sentAt) / 1000,
    platform: 'node',
    level: 'error',
    logger: 'yonagi',
    environment: env.NODE_ENV,
    server_name: undefined,
    message: { formatted: input.message },
    exception: isError
      ? {
          values: [
            {
              type: error.name,
              value: error.message,
              stacktrace: error.stack ? { frames: parseStack(error.stack) } : undefined,
            },
          ],
        }
      : undefined,
    extra: input.context,
    tags: {
      request_id: typeof input.context?.requestId === 'string' ? input.context.requestId : undefined,
      route: typeof input.context?.route === 'string' ? input.context.route : undefined,
    },
  };

  return [
    JSON.stringify({ event_id: eventId, sent_at: sentAt }),
    JSON.stringify({ type: 'event' }),
    JSON.stringify(event),
  ].join('\n');
}

/**
 * Sentry orders frames oldest-first, the reverse of a V8 stack string. Only the
 * top 30 are kept: past that it is framework plumbing nobody reads.
 */
function parseStack(stack: string): Array<Record<string, unknown>> {
  return stack
    .split('\n')
    .slice(1, 31)
    .map((line) => {
      const match = /at (?:(.+?) )?\(?(.+?):(\d+):(\d+)\)?$/.exec(line.trim());
      if (!match) return { function: line.trim() };
      return {
        function: match[1] ?? '<anonymous>',
        filename: match[2],
        lineno: Number(match[3]),
        colno: Number(match[4]),
      };
    })
    .reverse();
}

/** True when a DSN is configured and parsed. Exported for the health endpoint. */
export const errorReportingEnabled = parsed !== null;

export function reportError(input: ReportInput): void {
  if (!parsed) return;

  const eventId = crypto.randomUUID().replace(/-/g, '');
  const sentAt = new Date().toISOString();

  // Deliberately not awaited: a slow collector must not add latency to a
  // response that is already failing. `void` plus a catch keeps the rejection
  // from becoming an unhandled promise, which would be a second incident.
  void fetch(parsed.envelopeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-sentry-envelope',
      'X-Sentry-Auth': [
        'Sentry sentry_version=7',
        'sentry_client=yonagi/1.0',
        `sentry_key=${parsed.publicKey}`,
      ].join(', '),
    },
    body: buildEnvelope(input, eventId, sentAt),
    signal: AbortSignal.timeout(4000),
    // The collector is a third party; nothing about our session belongs in it.
    credentials: 'omit',
  }).catch(() => {
    // Reporting the failure of the error reporter through the error reporter is
    // how you build a loop. In production it is dropped; locally it is visible.
    if (!isProduction) console.warn('[error-reporting] delivery failed');
  });
}
