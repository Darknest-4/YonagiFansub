import 'server-only';
import { env, isProduction } from '@/infrastructure/env';

/**
 * Structured logger.
 *
 * JSON lines in production (ingestible by Loki/Datadog/CloudWatch without a
 * parser), colourised human output in development. No third-party dependency:
 * the API surface is small enough that a wrapper is cheaper than a library, and
 * swapping in pino later only means rewriting this file.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_WEIGHT: Record<LogLevel | 'silent', number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

const threshold = LEVEL_WEIGHT[env.LOG_LEVEL];

/** Keys whose values must never reach a log sink. */
const REDACTED_KEYS = new Set([
  'password',
  'passwordhash',
  'currentpassword',
  'newpassword',
  'passwordconfirmation',
  'token',
  'tokenhash',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'cookie',
  'secret',
  'authsecret',
  'apikey',
  's3secretaccesskey',
  'smtppassword',
]);

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[Depth limit]';
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redact(item, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = REDACTED_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : redact(item, depth + 1);
  }
  return out;
}

export interface LogContext {
  requestId?: string;
  userId?: string;
  route?: string;
  durationMs?: number;
  [key: string]: unknown;
}

function serialiseError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: isProduction ? undefined : error.stack,
      cause: error.cause instanceof Error ? error.cause.message : undefined,
    };
  }
  return { value: String(error) };
}

const DEV_COLOURS: Record<LogLevel, string> = {
  debug: '[90m',
  info: '[36m',
  warn: '[33m',
  error: '[31m',
};

function write(level: LogLevel, message: string, context?: LogContext, error?: unknown) {
  if (LEVEL_WEIGHT[level] < threshold) return;

  const payload = {
    level,
    time: new Date().toISOString(),
    message,
    ...(context ? (redact(context) as Record<string, unknown>) : {}),
    ...(error ? { error: serialiseError(error) } : {}),
  };

  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;

  /*
   * Errors are also forwarded to the reporting collector, if one is configured.
   * It reads the *redacted* payload rather than the caller's raw context, so a
   * key on the redaction list cannot reach a third party even though it never
   * reached stdout either. Imported lazily: `error-reporting` imports `env`,
   * which imports nothing, but the logger is imported by almost everything —
   * keeping the edge one-directional avoids a cycle at module-init time.
   */
  if (level === 'error') {
    void import('@/infrastructure/error-reporting')
      .then(({ reportError }) => {
        const { level: _level, time: _time, message: _message, ...rest } = payload;
        reportError({ message, error, context: rest });
      })
      .catch(() => {
        /* Reporting must never be able to break logging. */
      });
  }

  if (isProduction) {
    sink(JSON.stringify(payload));
    return;
  }

  const { level: _l, time: _t, message: _m, ...rest } = payload;
  const extras = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
  sink(`${DEV_COLOURS[level]}${level.toUpperCase().padEnd(5)}[0m ${message}${extras}`);
}

export const logger = {
  debug: (message: string, context?: LogContext) => write('debug', message, context),
  info: (message: string, context?: LogContext) => write('info', message, context),
  warn: (message: string, context?: LogContext) => write('warn', message, context),
  error: (message: string, error?: unknown, context?: LogContext) =>
    write('error', message, context, error),

  /** Returns a logger that stamps every line with the given context. */
  child(base: LogContext) {
    return {
      debug: (message: string, context?: LogContext) => write('debug', message, { ...base, ...context }),
      info: (message: string, context?: LogContext) => write('info', message, { ...base, ...context }),
      warn: (message: string, context?: LogContext) => write('warn', message, { ...base, ...context }),
      error: (message: string, error?: unknown, context?: LogContext) =>
        write('error', message, { ...base, ...context }, error),
    };
  },
};

export type Logger = typeof logger;
