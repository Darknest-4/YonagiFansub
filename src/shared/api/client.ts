'use client';

/**
 * Browser-side API client.
 *
 * Everything the UI knows about talking to the API lives here:
 *   • CSRF header injection (reads the cookie the middleware sets).
 *   • Envelope unwrapping — callers get `data`, never `{ data }`.
 *   • Typed failures — an `ApiError` carries the machine-readable `code` and the
 *     per-field validation errors, so a form can map them onto inputs.
 *   • Request de-duplication and abort support for the search-as-you-type paths.
 */

const CSRF_COOKIE_NAMES = ['__Host-yonagi_csrf', 'yonagi_csrf'];

export interface FieldErrors {
  [field: string]: string[];
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fields: FieldErrors;
  readonly requestId?: string;

  constructor(
    message: string,
    options: { code: string; status: number; fields?: FieldErrors; requestId?: string },
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = options.code;
    this.status = options.status;
    this.fields = options.fields ?? {};
    this.requestId = options.requestId;
  }

  /** True for failures the user can fix by editing the form. */
  get isValidation(): boolean {
    return this.code === 'VALIDATION_FAILED';
  }

  get isAuth(): boolean {
    return this.code === 'UNAUTHORIZED' || this.code === 'FORBIDDEN';
  }
}

function readCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;

  for (const name of CSRF_COOKIE_NAMES) {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
    if (match?.[1]) return decodeURIComponent(match[1]);
  }
  return null;
}

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Skip the JSON content-type header (used for multipart uploads). */
  raw?: boolean;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const { body, raw, headers, ...rest } = options;
  const method = (rest.method ?? 'GET').toUpperCase();

  const requestHeaders = new Headers(headers);
  requestHeaders.set('Accept', 'application/json');

  if (body !== undefined && !raw) {
    requestHeaders.set('Content-Type', 'application/json');
  }

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = readCsrfToken();
    if (csrf) requestHeaders.set('X-CSRF-Token', csrf);
  }

  const response = await fetch(path, {
    ...rest,
    method,
    headers: requestHeaders,
    credentials: 'same-origin',
    body: body === undefined ? undefined : raw ? (body as BodyInit) : JSON.stringify(body),
  });

  if (response.status === 204) return undefined as T;

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError('A szerver váratlan választ adott.', {
      code: 'INTERNAL_ERROR',
      status: response.status,
    });
  }

  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string; details?: { fields?: FieldErrors }; requestId?: string } })
      .error;

    throw new ApiError(error?.message ?? 'Ismeretlen hiba történt.', {
      code: error?.code ?? 'INTERNAL_ERROR',
      status: response.status,
      fields: error?.details?.fields,
      requestId: error?.requestId,
    });
  }

  return (payload as { data: T }).data;
}

/** Builds a query string, dropping empty values so URLs stay clean and cacheable. */
export function buildQuery(params: Record<string, string | number | boolean | undefined | null>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}
