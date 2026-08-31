import { NextResponse, type NextRequest } from 'next/server';

/**
 * Edge middleware.
 *
 * Runs on the edge runtime, which means no Prisma and no Node crypto — so it
 * deliberately does *not* try to authorise anything. Its jobs are:
 *
 *   1. Build the per-request Content Security Policy, with a fresh script nonce.
 *   2. Issue the CSRF cookie that the API handler validates.
 *   3. Cheap gating: bounce anonymous visitors away from `/admin` before a
 *      server component boots. Real authorisation still happens server-side in
 *      `ensureAdminAccess()` — this is an optimisation, never the control.
 *   4. Stamp a request id so a browser error and a server log line can be tied
 *      together.
 *
 * Treating step 3 as security would be a mistake: a forged cookie passes here.
 * It cannot pass `getSession()`.
 */

/**
 * Content Security Policy, built per request because of the nonce.
 *
 * `script-src` is the reason this lives here and not in `next.config.ts`. A
 * static header cannot carry a nonce, and without a nonce the only options are
 * `'unsafe-inline'` (which gives up XSS protection entirely) or blocking Next's
 * own scripts. The third option is what this project shipped with: the policy
 * had **no `script-src` at all**, so `default-src 'self'` applied to scripts and
 * the browser refused every inline script Next emits.
 *
 * That failure mode is worth spelling out, because it is invisible to `curl`:
 * React's streaming SSR sends the page body inside `<template>` elements and
 * moves them into place with small inline scripts. Blocked, the HTML arrives
 * complete — 100 kB of it — and the rendered page stays **empty**. Every route
 * returned 200 while every browser showed a blank screen.
 *
 * `'strict-dynamic'` lets the nonced bootstrap load Next's chunks without
 * listing each one; `'self'` stays as the fallback for browsers that do not
 * implement it.
 */
function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    /*
      hls.js parses segments in a Web Worker created from a blob. `worker-src`
      falls back to `script-src`, which is nonce-based and would reject it, so it
      is stated explicitly rather than left to inherit.
    */
    "worker-src 'self' blob:",
    "base-uri 'self'",
    "object-src 'none'",
    /*
      `frame-src 'self'` and not a provider list. Third-party players are framed
      through `/beagyazas/[id]`, a same-origin document that carries its own
      one-host policy — so adding a provider never touches this line, and a
      compromised host is confined to a frame with no session and no site script.
    */
    "frame-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob: https:",
    /*
      `blob:` is required by the protected video player. hls.js feeds the
      `<video>` element through Media Source Extensions, which means the element's
      `src` is a blob URL created in the page — that indirection is the point (no
      media URL ever appears in the DOM), and without `blob:` here the browser
      refuses to load it and playback silently fails.
    */
    "media-src 'self' blob: https:",
    // No Google Fonts hosts: `next/font/google` self-hosts the files at build
    // time, so the browser never contacts a third party.
    "font-src 'self'",
    // Next inlines critical CSS and framer-motion writes styles at runtime;
    // neither can carry a nonce. Scripts are the ones that matter here.
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self'",
    'upgrade-insecure-requests',
  ].join('; ');
}

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

  /*
    The isolated playback frame writes its own Content-Security-Policy, naming
    the one host that source is allowed to reach. Two policies on one response
    are intersected, so ours would override its `frame-ancestors 'self'` with
    `'none'` and the frame would refuse to render inside our own page. It is
    left alone here on purpose.
  */
  if (pathname.startsWith('/beagyazas/')) return NextResponse.next();

  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce);

  /*
   * The policy goes on the *request* as well as the response. Next reads the
   * incoming `Content-Security-Policy` header, pulls the nonce out of it, and
   * stamps that nonce onto every script tag it renders. Setting it only on the
   * response would leave Next's scripts unnonced — and therefore blocked.
   */
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  response.headers.set('Content-Security-Policy', csp);
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
