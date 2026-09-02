import { defineRoute } from '@/shared/api/handler';
import { env } from '@/infrastructure/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Reports what each upstream actually answers, from this server.
 *
 * Exists because "AniList doesn't work" is not something that can be debugged
 * from anywhere except the machine making the call: the same request succeeds
 * from a laptop and is refused from a datacenter IP, and the difference is
 * invisible until you ask from the host that is failing.
 *
 * Deliberately raw. It reports the status, the timing and the first part of the
 * body verbatim, because the useful signal is usually in there — a Cloudflare
 * interstitial, a GraphQL validation error naming a field, a rate-limit notice.
 * Summarising it would throw away the one thing worth reading.
 *
 * Behind `project:write`, and it sends no credentials of ours anywhere: the
 * requests it makes are the same unauthenticated ones the importer makes.
 */
export const GET = defineRoute({
  auth: 'project:write',
  rateLimit: 'admin:write',
  async handler() {
    return {
      config: {
        anilist: env.ANILIST_API_URL,
        jikan: env.JIKAN_API_URL,
        userAgent: env.METADATA_USER_AGENT,
      },
      checks: [
        await probe('anilist', env.ANILIST_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // The smallest query that proves the endpoint answers at all.
          body: JSON.stringify({ query: '{ Media(id: 1, type: ANIME) { id title { romaji } } }' }),
        }),
        await probe('jikan', `${env.JIKAN_API_URL}/anime/1`, { method: 'GET' }),
      ],
    };
  },
});

async function probe(name: string, url: string, init: RequestInit) {
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        'User-Agent': env.METADATA_USER_AGENT,
        ...init.headers,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });

    const text = await response.text().catch(() => '');

    return {
      name,
      url,
      ok: response.ok,
      status: response.status,
      durationMs: Date.now() - startedAt,
      contentType: response.headers.get('content-type'),
      // Cloudflare identifies itself in these; their presence is usually the
      // whole answer.
      server: response.headers.get('server'),
      cfRay: response.headers.get('cf-ray'),
      retryAfter: response.headers.get('retry-after'),
      bodyPreview: text.slice(0, 600),
    };
  } catch (error) {
    return {
      name,
      url,
      ok: false,
      status: 0,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? `${error.name}: ${error.message}` : 'ismeretlen hiba',
    };
  }
}
