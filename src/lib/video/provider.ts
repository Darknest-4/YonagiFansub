import 'server-only';

/**
 * Provider URL handling.
 *
 * Two jobs, both pure so they can be tested without a database:
 *
 *   • **Extraction** — turn a pasted page URL into the provider's file id. This
 *     is the difference between "paste the link you already have" and "open the
 *     provider, find the id, copy just that part", and the second is how a
 *     feature ends up unused.
 *   • **Composition** — turn an id back into the embed URL, and check the result
 *     is somewhere we are willing to send a viewer.
 */

export interface ProviderShape {
  slug: string;
  embedTemplate: string | null;
  urlPatterns: string[];
  domains: string[];
}

/**
 * Pulls the file id out of a URL a person pasted.
 *
 * Patterns are tried in order and the first capturing group wins. A pattern
 * that fails to compile is skipped rather than thrown: these are editable in
 * the admin, and one bad regex must not take the whole provider offline.
 *
 * Returns `null` when nothing matches, which the caller reports as "this does
 * not look like a <provider> link" — far more useful than silently storing an
 * id that will 404 at playback.
 */
export function extractExternalId(provider: ProviderShape, input: string): string | null {
  const candidate = input.trim();
  if (candidate === '') return null;

  for (const pattern of provider.urlPatterns) {
    let regex: RegExp;
    try {
      regex = new RegExp(pattern, 'i');
    } catch {
      continue;
    }

    const match = regex.exec(candidate);
    const captured = match?.[1]?.trim();
    if (captured) return captured;
  }

  /*
    Nothing matched. If what was pasted is not a URL at all, treat it as the id
    itself — people routinely have just the id to hand, and refusing it would be
    pedantry. Anything with a slash or a scheme is a URL we failed to parse, and
    guessing at that would store nonsense.
  */
  if (!/[/\s:]/.test(candidate)) return candidate;

  return null;
}

/** Builds the embed URL, or `null` when the provider has no template. */
export function buildEmbedUrl(provider: ProviderShape, externalId: string): string | null {
  if (!provider.embedTemplate) return null;
  return provider.embedTemplate.replaceAll('{id}', encodeURIComponent(externalId));
}

/**
 * Whether a URL is one this provider is declared to serve.
 *
 * Checked at playback, not only at save time: `domains` is what the embed
 * frame's CSP is built from, so a source whose URL drifted outside the declared
 * set would be framed under a policy that does not cover it — and would fail in
 * a way that looks like the provider being down. Better to refuse it here and
 * say so.
 *
 * Subdomains are accepted (`cdn.host.tld` for a declared `host.tld`) because
 * filehosts rotate them constantly; a different registrable domain is not.
 */
export function isAllowedUrl(provider: ProviderShape, url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'https:') return false;
  if (provider.domains.length === 0) return false;

  const host = parsed.hostname.toLowerCase();
  return provider.domains.some((domain) => {
    const clean = domain.trim().toLowerCase().replace(/^\./, '');
    return clean !== '' && (host === clean || host.endsWith(`.${clean}`));
  });
}

/**
 * The `frame-src` / `media-src` value for one source's isolated document.
 *
 * Every declared domain plus its subdomains, and nothing else. This is the
 * whole reason providers can be added without a deploy: the site-wide policy
 * stays at `'self'`, and the widening happens inside one throwaway frame.
 */
export function cspSourceList(domains: string[]): string {
  const hosts = domains
    .map((domain) => domain.trim().toLowerCase().replace(/^\./, ''))
    .filter((domain) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain));

  if (hosts.length === 0) return "'none'";

  // Both forms: the bare host, and a wildcard for the subdomains filehosts
  // rotate through.
  return [...new Set(hosts.flatMap((host) => [`https://${host}`, `https://*.${host}`]))].join(' ');
}

/**
 * Host of a direct file URL, for the same purpose.
 *
 * A direct file has no provider domain list to work from — the URL itself is the
 * declaration — so the policy is built from exactly that one host.
 */
export function cspHostOf(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? `https://${parsed.hostname}` : "'none'";
  } catch {
    return "'none'";
  }
}
