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

export function jsonOk<T>(
  data: T,
  init: { status?: number; meta?: ApiMeta; headers?: HeadersInit } = {},
): NextResponse<ApiSuccess<T>> {
  const body: ApiSuccess<T> = { data: serialise(data) };
  if (init.meta) body.meta = init.meta;

  return NextResponse.json(body, {
    status: init.status ?? 200,
    headers: {
      'Cache-Control': 'no-store',
      ...init.headers,
    },
  });
}

export function jsonCreated<T>(data: T, headers?: HeadersInit) {
  return jsonOk(data, { status: 201, headers });
}

export function jsonNoContent(headers?: HeadersInit) {
  return new NextResponse(null, { status: 204, headers });
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
