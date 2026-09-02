import 'server-only';
import { headers } from 'next/headers';
import { env } from '@/infrastructure/env';

/**
 * Where this site actually lives.
 *
 * ## The problem
 *
 * Every absolute URL the site emits — canonical links, `og:url`, the sitemap,
 * the feed — used to come from `NEXT_PUBLIC_SITE_URL`, whose default is
 * `http://localhost:3000`. Deploy without setting it and the site is perfectly
 * usable while telling Google, every share preview and every feed reader that
 * it is hosted on the visitor's own machine. Nothing breaks visibly; everything
 * is wrong.
 *
 * ## The rule
 *
 * 1. `NEXT_PUBLIC_SITE_URL` set in the environment → that, always. It is an
 *    explicit operator decision, and a deployment that says where it lives
 *    should not be second-guessed by a header.
 * 2. Otherwise → the host of the request being served, which is the address the
 *    visitor typed and therefore the address that works for them.
 * 3. No request in scope (a cron job, a mail worker) → the env default.
 *
 * ## Why emails do not use this
 *
 * `Host` and `X-Forwarded-Host` are supplied by the client. Behind a correctly
 * configured proxy they are rewritten, but nothing in the application can
 * *verify* that, and a request can be made directly to the origin with any host
 * you like. That is fine for the values here, which are echoed back into the
 * page the same requester is reading — poisoning them poisons your own view.
 *
 * It is not fine for anything sent to a **third party**. A password-reset link
 * built from a spoofed host is a working phishing link, delivered by us, to the
 * victim's own inbox — the classic host-header-poisoning account takeover. So
 * mail keeps reading `env.NEXT_PUBLIC_SITE_URL` directly, and `mailSiteUrl()`
 * below exists to make that a deliberate, named choice rather than an accident
 * somebody "cleans up" later.
 */

/**
 * The variable as it is at **runtime**, read with bracket notation on purpose.
 *
 * Next replaces every literal `process.env.NEXT_PUBLIC_FOO` in the source with
 * the value it had at build time — that substitution is how the value reaches
 * the browser bundle, and it applies to server code too. So the dotted form is
 * frozen at `next build`, and setting the variable afterwards changes nothing.
 *
 * That is the exact trap this whole file exists to get out of: build the image
 * without the variable, set it on the host, restart — and the site still says
 * `localhost:3000`, with no error anywhere to explain why.
 *
 * The replacement is textual and only matches the dotted form, so bracket
 * access reads the real `process.env` at request time. Three outcomes, all
 * correct: set at build → honoured; set only at runtime → honoured; never set →
 * derived from the request below.
 */
function configuredUrl(): string | null {
  const raw = process.env['NEXT_PUBLIC_SITE_URL']?.trim();
  if (!raw) return null;

  try {
    // A malformed value must not take the site down at render time; falling
    // through to the request host is strictly better than throwing.
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/**
 * Hostnames only: letters, digits, dots, hyphens, and an optional `:port`.
 *
 * A header is a string an attacker chooses, and it lands inside a URL that ends
 * up in `Location`, in `<link rel="canonical">` and in XML. Anything with a
 * slash, a space, a CR or an LF in it is refused outright rather than escaped —
 * there is no legitimate host containing those, so rejecting is both safer and
 * simpler than sanitising.
 */
const HOST_PATTERN = /^[a-z0-9.-]+(?::\d{1,5})?$/i;

function fromHeaderBag(bag: Headers): string | null {
  /*
    `x-forwarded-host` first: behind a proxy (Render, Vercel, nginx) `host` is
    the internal name the proxy dialled, and the public name is only in the
    forwarded header. A comma-separated chain means several proxies — the first
    entry is the one closest to the client, which is the public one.
  */
  const forwarded = bag.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwarded || bag.get('host')?.trim();
  if (!host || !HOST_PATTERN.test(host)) return null;

  const proto = bag.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const scheme =
    proto === 'https' || proto === 'http'
      ? proto
      : // No forwarded scheme: a bare localhost is plainly http, anything else
        // reached over the public internet is https in practice, and guessing
        // http there would emit mixed-content links on an https page.
        host.startsWith('localhost') || host.startsWith('127.0.0.1')
        ? 'http'
        : 'https';

  return `${scheme}://${host}`;
}

/**
 * The origin to use for links this site emits about itself.
 *
 * Async because `headers()` is: it is only readable inside a request scope, and
 * outside one it throws rather than returning empty — hence the try/catch,
 * which is the documented way to ask "is there a request here".
 */
export async function siteUrl(): Promise<string> {
  const configured = configuredUrl();
  if (configured) return configured;

  try {
    const derived = fromHeaderBag(await headers());
    if (derived) return derived;
  } catch {
    // Called outside a request (a background job, a module init). The env
    // default is the only answer available, and it is the right one.
  }

  return env.NEXT_PUBLIC_SITE_URL;
}

/**
 * The origin for links that leave the building: email, webhooks, anything
 * handed to somebody who is not the requester.
 *
 * Never derived from a header. See the note at the top of this file — this is
 * the difference between a canonical tag and a phishing link.
 */
export function mailSiteUrl(): string {
  return configuredUrl() ?? env.NEXT_PUBLIC_SITE_URL;
}

/** Joins a path onto the resolved origin. `path` must start with `/`. */
export async function absoluteUrl(path: string): Promise<string> {
  return `${await siteUrl()}${path}`;
}
