import { z } from 'zod';
import { defineRoute } from '@/lib/api/handler';
import { lookupAnime } from '@/server/admin/metadata-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Preview an import without writing anything.
 *
 * Separate from the import itself so the admin can see what would land before
 * committing to it — an importer that only reports after the fact is one people
 * run once and then stop trusting.
 *
 * Rate-limited as a write despite being a read: each call fans out to two
 * third-party APIs, so the cost that matters is theirs, not ours.
 */
export const GET = defineRoute({
  auth: 'project:write',
  rateLimit: 'admin:write',
  query: z.object({
    anilistId: z.coerce.number().int().positive().optional(),
    malId: z.coerce.number().int().positive().optional(),
    /** Episode lists are the slow half; the preview does not need them. */
    episodes: z.coerce.boolean().default(false),
  }),
  async handler({ query }) {
    const data = await lookupAnime({
      anilistId: query.anilistId ?? null,
      malId: query.malId ?? null,
      includeEpisodes: query.episodes,
    });

    return {
      anilistId: data.anilistId,
      malId: data.malId,
      displayTitle: data.displayTitle,
      titleRomaji: data.titleRomaji,
      titleEnglish: data.titleEnglish,
      titleNative: data.titleNative,
      synopsis: data.synopsis,
      type: data.type,
      season: data.season,
      seasonYear: data.seasonYear,
      totalEpisodes: data.totalEpisodes,
      durationMin: data.durationMin,
      studio: data.studio,
      studios: data.studios,
      source: data.source,
      averageScore: data.averageScore,
      malScore: data.malScore,
      coverImageUrl: data.coverImageUrl,
      bannerImageUrl: data.bannerImageUrl,
      accentColor: data.accentColor,
      genres: data.genres.map((genre) => genre.name),
      tags: data.tags,
      episodeCount: data.episodes.length,
      sources: data.sources,
      warnings: data.warnings,
    };
  },
});
