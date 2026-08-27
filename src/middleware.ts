import { NextResponse, type NextRequest } from 'next/server';

/**
 * Edge middleware.
 *
 * Runs on the edge runtime, which means no Prisma and no Node crypto — so it
 * deliberately does *not* try to authorise anything. Its jobs are:
 *
 *   1. Issue the CSRF cookie that the API handler validates.
 *   2. Cheap gating: bounce anonymous visitors away from `/admin` before a
 *      server component boots. Real authorisation still happens server-side in
 *      `ensureAdminAccess()` — this is an optimisation, never the control.
 *   3. Stamp a request id so a browser error and a server log line can be tied
 *      together.
 *
 * Treating step 2 as security would be a mistake: a forged cookie passes here.
 * It cannot pass `getSession()`.
 */

const SESSION_COOKIE =
  process.env.NODE_ENV === 'production' ? '__Host-yonagi_session' : 'yonagi_session';
const CSRF_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-yonagi_csrf' : 'yonagi_csrf';

/** Web Crypto HMAC — the Node `crypto` module is unavailable on the edge. */
async function issueCsrfToken(secret: string): Promise<string> {
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(nonce));
  const encoded = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${nonce}.${encoded}`;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Cheap admin gate. Presence of a cookie only — validity is checked server-side.
  if (pathname.startsWith('/admin') && !request.cookies.get(SESSION_COOKIE)) {
    const loginUrl = new URL('/belepes', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.next();

  response.headers.set('X-Request-Id', crypto.randomUUID());

  // The CSRF cookie is readable by JavaScript on purpose: the browser copies it
  // into the `X-CSRF-Token` header, and the server compares the two. Same-origin
  // policy is what stops an attacker's page from reading it.
  if (!request.cookies.get(CSRF_COOKIE)) {
    const secret = process.env.AUTH_SECRET;
    if (secret && secret.length >= 32) {
      response.cookies.set(CSRF_COOKIE, await issueCsrfToken(secret), {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 12,
      });
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image optimisation output. Running on
     * `/_next/static` would cost latency on every chunk for no benefit.
     */
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|robots.txt|sitemap.xml|uploads/).*)',
  ],
};
