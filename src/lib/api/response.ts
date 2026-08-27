import { NextResponse } from 'next/server';
import { isAppError, toAppError, type ErrorCode } from '@/lib/errors';

/**
 * The single response envelope used by every `/api/v1` endpoint.
 *
 * Success: `{ data, meta? }`
 * Failure: `{ error: { code, message, details?, requestId } }`
 *
 * Clients can branch on the presence of `error` alone, and `code` is a stable
 * machine-readable string that never changes with copy edits.
 */

export interface ApiMeta {
  page?: number;
  perPage?: number;
  total?: number;
  totalPages?: number;
  hasNext?: boolean;
  hasPrevious?: boolean;
  [key: string]: unknown;
}

export interface ApiSuccess<T> {
  data: T;
  meta?: ApiMeta;
}

export interface ApiFailure {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
    requestId: string;
  };
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

/**
 * JSON serialisation with the two shapes Prisma returns that `JSON.stringify`
 * cannot handle on its own: `BigInt` (file sizes) and `Decimal` (episode
 * numbers). Both become strings, which is also the correct wire format for
 * values that may exceed `Number.MAX_SAFE_INTEGER`.
 */
export function serialise<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, item) => {
      if (typeof item === 'bigint') return item.toString();
      if (
        item !== null &&
        typeof item === 'object' &&
        'toFixed' in item &&
        typeof (item as { toFixed?: unknown }).toFixed === 'function' &&
        !(item instanceof Date)
      ) {
        return (item as { toString(): string }).toString();
      }
      return item;
    }),
  ) as T;
}

/**
 * Merges caller headers over the defaults.
 *
 * Written as an explicit `Headers` merge rather than an object spread because
 * `{ ...new Headers(...) }` evaluates to `{}` — a `Headers` object holds nothing
 * in own enumerable properties, only behind its iterator. That silently dropped
 * every header `defineRoute` attached: the `X-RateLimit-*` trio never reached a
 * client, and the `Cache-Control: public, s-maxage=…` that ten public endpoints
 * declare was replaced by `no-store` on every single response. Both failed
 * invisibly — the responses were correct, just uncacheable and unmetered.
 *
 * `Cache-Control` is a default here, not a fixed value: a route that sets its
 * own keeps it, and everything else stays `no-store`.
 */
function mergeHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'no-store');
  return headers;
}

export function jsonOk<T>(
  data: T,
  init: { status?: number; meta?: ApiMeta; headers?: HeadersInit } = {},
): NextResponse<ApiSuccess<T>> {
  const body: ApiSuccess<T> = { data: serialise(data) };
  if (init.meta) body.meta = init.meta;

  return NextResponse.json(body, {
    status: init.status ?? 200,
    headers: mergeHeaders(init.headers),
  });
}

export function jsonCreated<T>(data: T, headers?: HeadersInit) {
  return jsonOk(data, { status: 201, headers });
}

export function jsonNoContent(headers?: HeadersInit) {
  return new NextResponse(null, { status: 204, headers: mergeHeaders(headers) });
}

export function jsonError(
  error: unknown,
  requestId: string,
  extraHeaders?: HeadersInit,
): NextResponse<ApiFailure> {
  const appError = toAppError(error);

  const body: ApiFailure = {
    error: {
      code: appError.code,
      // Internal failures must not leak their message to the client; the request
      // id is the bridge to the server log that has the full story.
      message: appError.expose ? appError.message : 'Váratlan hiba történt.',
      ...(appError.expose && appError.details !== undefined
        ? { details: appError.details }
        : {}),
      requestId,
    },
  };

  const headers = new Headers(extraHeaders);
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Request-Id', requestId);

  if (isAppError(error) && error.code === 'RATE_LIMITED') {
    const retryAfter = (error.details as { retryAfterSeconds?: number } | undefined)
      ?.retryAfterSeconds;
    if (retryAfter) headers.set('Retry-After', String(retryAfter));
  }

  return NextResponse.json(body, { status: appError.status, headers });
}
