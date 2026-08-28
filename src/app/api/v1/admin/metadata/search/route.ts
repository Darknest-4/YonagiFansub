import { z } from 'zod';
import { defineRoute } from '@/lib/api/handler';
import { searchJikanAnime } from '@/lib/anime/jikan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Title search against MyAnimeList, so an id can be found without leaving the
 * form. Jikan rather than AniList because its search endpoint needs no query
 * document and returns the MAL id, which is the one that unlocks episode titles.
 */
export const GET = defineRoute({
  auth: 'project:write',
  rateLimit: 'admin:write',
  query: z.object({
    q: z.string().trim().min(2, 'Legalább 2 karakter.').max(80),
    limit: z.coerce.number().int().min(1).max(20).default(10),
  }),
  async handler({ query }) {
    return searchJikanAnime(query.q, query.limit);
  },
});
