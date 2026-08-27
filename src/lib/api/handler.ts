import 'server-only';
import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z, type ZodTypeAny } from 'zod';
import '@/lib/validation/error-map';
import { env, isProduction } from '@/lib/env';
import { logger } from '@/lib/logger';
import {
  BadRequestError,
  ForbiddenError,
  PayloadTooLargeError,
  UnsupportedMediaTypeError,
  ValidationError,
  toAppError,
  type FieldErrors,
} from '@/lib/errors';
import { jsonError, jsonOk, type ApiMeta } from '@/lib/api/response';
import {
  enforceRateLimit,
  rateLimitHeaders,
  type RateLimitKey,
  type RateLimitResult,
} from '@/lib/api/rate-limit';
import { clientIp, hashIp, verifyCsrfToken } from '@/lib/auth/tokens';
import { getSession, toActor, CSRF_COOKIE, type SessionUser } from '@/lib/auth/session';
import { hasPermission, type Permission } from '@/lib/auth/permissions';
import { UnauthorizedError } from '@/lib/errors';

/**
 * Route handler factory.
 *
 * Every API endpoint is declared through `defineRoute`, which owns the
 * cross-cutting concerns exactly once:
 *
 *   request id → rate limit → CSRF → authentication → authorisation →
 *   input validation → handler → response envelope → error mapping → access log
 *
 * A route file therefore contains only its business logic, and no endpoint can
 * accidentally ship without a rate limit or with an unvalidated body.
 */

const MAX_BODY_BYTES = 1024 * 512; // 512 KB — JSON payloads only; uploads use their own route.

export type AuthRequirement = 'public' | 'optional' | 'user' | 'verified' | Permission;

export interface RouteContext<TBody, TQuery, TParams> {
  req: NextRequest;
  body: TBody;
  query: TQuery;
  params: TParams;
  user: SessionUser | null;
  requestId: string;
  ip: string | null;
  ipHash: string | null;
  userAgent: string | null;
  /** Convenience for handlers that also want to emit their own headers. */
  headers: Headers;
}

export interface RouteDefinition<
  TBodySchema extends ZodTypeAny | undefined,
  TQuerySchema extends ZodTypeAny | undefined,
  TParamsSchema extends ZodTypeAny | undefined,
  TResult,
> {
  auth?: AuthRequirement;
  rateLimit?: RateLimitKey;
  /** Defaults to true for every non-GET/HEAD method. */
  csrf?: boolean;
  body?: TBodySchema;
  query?: TQuerySchema;
  params?: TParamsSchema;
  /** Optional cache header for public GET endpoints. */
  cache?: { sMaxAge: number; staleWhileRevalidate?: number };
  handler: (
    context: RouteContext<
      TBodySchema extends ZodTypeAny ? z.infer<TBodySchema> : undefined,
      TQuerySchema extends ZodTypeAny ? z.infer<TQuerySchema> : undefined,
      TParamsSchema extends ZodTypeAny ? z.infer<TParamsSchema> : Record<string, never>
    >,
  ) => Promise<TResult | NextResponse>;
  /** Attached to the success envelope – used by list endpoints for pagination. */
  meta?: (result: TResult) => ApiMeta | undefined;
}

/**
 * Next type-checks the exported handler's signature at build time and requires
 * the context argument — and its `params` promise — to be non-optional, because
 * it passes one on every route, dynamic segments or not (a static route simply
 * resolves to an empty object). The runtime code still guards, since these
 * handlers are also called directly from tests.
 */
type NextRouteArgs = { params: Promise<Record<string, string | string[]>> };

function fieldErrorsFrom(error: z.ZodError): FieldErrors {
  const fields: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    (fields[key] ??= []).push(issue.message);
  }
  return fields;
}

async function readJsonBody(req: NextRequest): Promise<unknown> {
  const contentType = req.headers.get('content-type') ?? '';

  if (!contentType.includes('application/json')) {
    throw new UnsupportedMediaTypeError('A kérés törzse csak application/json lehet.');
  }

  const declaredLength = Number(req.headers.get('content-length') ?? '0');
  if (declaredLength > MAX_BODY_BYTES) throw new PayloadTooLargeError();

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) throw new PayloadTooLargeError();
  if (!raw.trim()) return {};

  try {
    return JSON.parse(raw);
  } catch {
    throw new BadRequestError('A kérés törzse nem érvényes JSON.');
  }
}

/**
 * Same-origin enforcement.
 *
 * Double protection for state-changing requests: a signed CSRF token *and* an
 * `Origin` check. SameSite=Lax already blocks the classic form-post attack; these
 * two cover the gaps (Lax allows top-level GET navigation, and older browsers).
 */
function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (!origin) return; // Non-browser clients (curl, server-to-server) send none.

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ForbiddenError('Érvénytelen Origin fejléc.');
  }

  /*
   * Same-origin means the `Origin` header matches the host the browser actually
   * addressed — the `Host` header. Comparing only against the configured site URL
   * breaks every legitimate deployment where the two differ: a local `next start`
   * on another port, a preview URL, an internal hostname behind a proxy. The
   * configured origin is accepted as well, so a proxy that rewrites `Host` still
   * works.
   */
  const allowed = new Set(
    [new URL(env.NEXT_PUBLIC_SITE_URL).host, req.headers.get('host'), req.nextUrl.host].filter(
      (host): host is string => Boolean(host),
    ),
  );

  if (!allowed.has(originHost)) {
    throw new ForbiddenError('A kérés nem az oldalról érkezett.');
  }
}

export function defineRoute<
  TResult,
  TBodySchema extends ZodTypeAny | undefined = undefined,
  TQuerySchema extends ZodTypeAny | undefined = undefined,
  TParamsSchema extends ZodTypeAny | undefined = undefined,
>(definition: RouteDefinition<TBodySchema, TQuerySchema, TParamsSchema, TResult>) {
  return async function route(req: NextRequest, args: NextRouteArgs): Promise<NextResponse> {
    const requestId = req.headers.get('x-request-id') ?? randomUUID();
    const startedAt = performance.now();
    const method = req.method.toUpperCase();
    const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(method);
    const routeLogger = logger.child({ requestId, route: `${method} ${req.nextUrl.pathname}` });

    const ip = clientIp(req.headers);
    const ipHash = hashIp(ip);
    const userAgent = req.headers.get('user-agent');
    const extraHeaders = new Headers({ 'X-Request-Id': requestId });

    let rateLimitResult: RateLimitResult | null = null;
    let user: SessionUser | null = null;

    try {
      // ── 1. Session (needed before rate limiting so limits can be per-user) ──
      const authRequirement = definition.auth ?? 'public';
      if (authRequirement !== 'public') {
        const session = await getSession();
        user = session?.user ?? null;
      }

      // ── 2. Rate limit ──────────────────────────────────────────────────────
      if (definition.rateLimit) {
        const identifier = user?.id ?? ipHash ?? 'anonymous';
        rateLimitResult = await enforceRateLimit(definition.rateLimit, identifier);
        for (const [key, value] of Object.entries(rateLimitHeaders(rateLimitResult))) {
          extraHeaders.set(key, value);
        }
      }

      // ── 3. CSRF / same-origin ──────────────────────────────────────────────
      const csrfRequired = definition.csrf ?? isMutation;
      if (csrfRequired) {
        assertSameOrigin(req);

        const headerToken = req.headers.get('x-csrf-token');
        const cookieToken = req.cookies.get(CSRF_COOKIE)?.value;

        if (!headerToken || !cookieToken || headerToken !== cookieToken) {
          throw new ForbiddenError('Hiányzó vagy érvénytelen CSRF token. Töltsd újra az oldalt.');
        }
        if (!verifyCsrfToken(headerToken)) {
          throw new ForbiddenError('Érvénytelen CSRF token. Töltsd újra az oldalt.');
        }
      }

      // ── 4. Authorisation ───────────────────────────────────────────────────
      if (authRequirement !== 'public' && authRequirement !== 'optional') {
        if (!user) throw new UnauthorizedError();

        if (authRequirement === 'verified' && !user.emailVerifiedAt) {
          throw new ForbiddenError('Erősítsd meg az e-mail-címed a folytatáshoz.');
        }
        if (
          authRequirement !== 'user' &&
          authRequirement !== 'verified' &&
          !hasPermission(toActor(user), authRequirement)
        ) {
          throw new ForbiddenError('Nincs jogosultságod ehhez a művelethez.');
        }
      }

      // ── 5. Input validation ────────────────────────────────────────────────
      let body: unknown;
      if (definition.body) {
        const raw = await readJsonBody(req);
        const parsed = definition.body.safeParse(raw);
        if (!parsed.success) throw new ValidationError(fieldErrorsFrom(parsed.error));
        body = parsed.data;
      }

      let query: unknown;
      if (definition.query) {
        const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
        const parsed = definition.query.safeParse(raw);
        if (!parsed.success) throw new ValidationError(fieldErrorsFrom(parsed.error));
        query = parsed.data;
      }

      let params: unknown = {};
      const rawParams = args?.params ? await args.params : {};
      if (definition.params) {
        const parsed = definition.params.safeParse(rawParams);
        if (!parsed.success) throw new ValidationError(fieldErrorsFrom(parsed.error));
        params = parsed.data;
      } else {
        params = rawParams;
      }

      // ── 6. Handler ─────────────────────────────────────────────────────────
      const result = await definition.handler({
        req,
        body: body as never,
        query: query as never,
        params: params as never,
        user,
        requestId,
        ip,
        ipHash,
        userAgent,
        headers: extraHeaders,
      });

      if (result instanceof NextResponse) {
        for (const [key, value] of extraHeaders) result.headers.set(key, value);
        return result;
      }

      /*
       * A shared-cache header is only ever attached to a route declared
       * `auth: 'public'`.
       *
       * The `!user` check alone would look sufficient and be worthless: step 1
       * only loads the session when the route requires one, so on a public route
       * `user` is null no matter who is calling, and the condition can never
       * fire. What actually keeps a personalised response out of a CDN is the
       * requirement below — a public route has no session to personalise from,
       * by construction. `!user` stays as the second lock for the `optional`
       * case, where a session may be present.
       */
      const publiclyCacheable =
        definition.cache !== undefined &&
        !isMutation &&
        authRequirement === 'public' &&
        !user;

      if (publiclyCacheable && definition.cache) {
        const { sMaxAge, staleWhileRevalidate = sMaxAge * 4 } = definition.cache;
        extraHeaders.set(
          'Cache-Control',
          `public, s-maxage=${sMaxAge}, stale-while-revalidate=${staleWhileRevalidate}`,
        );
      }

      const response = jsonOk(result, {
        meta: definition.meta?.(result),
        headers: extraHeaders,
      });

      routeLogger.info('Request completed', {
        status: response.status,
        durationMs: Math.round(performance.now() - startedAt),
        userId: user?.id,
      });

      return response;
    } catch (error) {
      const appError = toAppError(error);

      if (appError.status >= 500) {
        routeLogger.error('Request failed', error, {
          durationMs: Math.round(performance.now() - startedAt),
          userId: user?.id,
        });
      } else {
        routeLogger.warn('Request rejected', {
          code: appError.code,
          status: appError.status,
          durationMs: Math.round(performance.now() - startedAt),
          userId: user?.id,
          // The message is safe to log for 4xx: these are our own copy strings.
          message: appError.message,
        });
      }

      return jsonError(isProduction ? appError : error, requestId, extraHeaders);
    }
  };
}

/** Shortcut for the many endpoints whose params are a single `{ slug }`. */
export const slugParams = z.object({ slug: z.string().min(1).max(120) });
export const idParams = z.object({ id: z.string().cuid() });
