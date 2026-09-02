import 'server-only';
import { Prisma } from '@prisma/client';
import { db } from '@/infrastructure/db';
import { BadRequestError, ConflictError, NotFoundError, ServiceUnavailableError } from '@/shared/lib/errors';
import { logger } from '@/infrastructure/logger';
import { UpstreamError } from '@/infrastructure/http/upstream';
import { invalidateProject } from '@/infrastructure/cache';
import { slugify } from '@/shared/lib/utils';
import { fetchAniListMedia, probeAniListId } from '@/features/metadata/anilist';
import { fetchJikanAnime, fetchJikanEpisodes } from '@/features/metadata/jikan';
import { normalizeAnime, type NormalizedAnime } from '@/features/metadata/normalize';
import type { MutationContext } from '@/shared/api/mutation-context';

/**
 * Anime metadata import and resync.
 *
 * ## What sync may and may not overwrite
 *
 * The hard rule: **upstream owns facts, the team owns editorial.** A resync that
 * silently replaced a hand-written Hungarian synopsis with AniList's English one
 * would make the feature actively dangerous to run, so the fields split into two
 * groups and stay there.
 *
 *   • *Upstream facts* — scores, credits, air dates, episode counts, tags. These
 *     genuinely change upstream and are refreshed on every sync. Nobody edits a
 *     MAL score by hand, and if they did, it would be wrong.
 *   • *Editorial* — the display title, synopsis, cover, banner, trailer, accent
 *     colour. Filled only when empty. A team that translated the synopsis or
 *     picked a nicer cover keeps it forever without having to disable sync.
 *
 * Never touched at all: `slug`, `status`, `publishStatus`, `isFeatured` and the
 * whole fansub workflow. Those are answers to "what are *we* doing", and no
 * upstream has an opinion on them.
 *
 * `overwriteEditorial` exists for the deliberate "re-import everything" action,
 * where the person clicking it has asked for exactly that.
 *
 * ## Episodes
 *
 * Missing episodes are created. Episodes the importer created are refreshed.
 * Episodes somebody typed by hand (`metadataSyncedAt IS NULL`) are left alone,
 * and **no episode is ever deleted** — a release points at one, and an upstream
 * that renumbers its list must not cascade into our download links.
 *
 * Workflow progress and episode status are never written here for the same
 * reason as above: they are the team's, not MAL's.
 */

/** One readable line about why an upstream call failed. */
function describeUpstream(error: unknown): string {
  if (error instanceof UpstreamError) {
    // 403 from AniList is almost always Cloudflare turning away a datacenter
    // IP, and saying so saves a long debugging session.
    const hint =
      error.status === 403
        ? ' (a szolgáltató elutasította a kérést — gyakran a szerver IP-címe miatt)'
        : error.status === 429
          ? ' (túl sok kérés)'
          : '';
    return `HTTP ${error.status}${hint}`;
  }
  if (error instanceof Error) return error.message;
  return 'ismeretlen hiba';
}

export interface SyncOptions {
  /** Also replace the curated fields (title, synopsis, artwork). */
  overwriteEditorial?: boolean;
  /** Skip the episode list, which is the expensive half of a sync. */
  skipEpisodes?: boolean;
}

export interface SyncResult {
  projectId: string;
  sources: string[];
  /** Upstreams that failed without stopping the run. */
  warnings: string[];
  episodesCreated: number;
  episodesUpdated: number;
  episodesSkipped: number;
  episodesTruncated: boolean;
  genresLinked: number;
}

/**
 * Fetches from both upstreams and merges.
 *
 * Exported on its own so the admin can preview an import before it touches a
 * project — "show me what you would write" is the difference between a feature
 * people trust and one they run once.
 */
export interface LookupResult extends NormalizedAnime {
  /** Non-fatal upstream problems, so the caller can report a partial result. */
  warnings: string[];
}

export async function lookupAnime(params: {
  anilistId?: number | null;
  malId?: number | null;
  includeEpisodes?: boolean;
}): Promise<LookupResult> {
  const { anilistId, malId, includeEpisodes = true } = params;

  if (!anilistId && !malId) {
    throw new BadRequestError('Adj meg AniList- vagy MyAnimeList-azonosítót.');
  }

  /*
    Either source failing is survivable; both failing is not.

    This matters in practice: AniList sits behind Cloudflare and will refuse
    requests from some hosting providers, while Jikan answers the same server
    fine. Treating an AniList outage as fatal meant an import that could have
    succeeded from MyAnimeList alone returned nothing at all — a hard failure
    where a partial result was available and useful.

    The failure is captured rather than swallowed, so the caller can say which
    source was missing instead of quietly returning thinner data.
  */
  let anilist: Awaited<ReturnType<typeof fetchAniListMedia>> = null;
  let anilistError: string | null = null;

  try {
    anilist = await fetchAniListMedia({ anilistId, malId });
  } catch (error) {
    anilistError = describeUpstream(error);
    logger.warn('AniList lekérdezés sikertelen, folytatás a MyAnimeList adataival', {
      anilistId,
      malId,
      error: anilistError,
    });
  }

  // AniList carries the MAL id, so one id is enough to reach both. Without that
  // hop, entering only an AniList id would mean no episode titles at all — and
  // when AniList is the source that failed, only an explicit MAL id can save us.
  const resolvedMalId = malId ?? anilist?.idMal ?? null;

  let jikan: Awaited<ReturnType<typeof fetchJikanAnime>> = null;
  let jikanError: string | null = null;

  if (resolvedMalId) {
    try {
      jikan = await fetchJikanAnime(resolvedMalId);
    } catch (error) {
      jikanError = describeUpstream(error);
      logger.warn('Jikan lekérdezés sikertelen', { malId: resolvedMalId, error: jikanError });
    }
  }

  if (!anilist && !jikan) {
    // Both down, or neither knows this id. The two cases need different
    // messages: "try again" versus "check the id".
    const failures = [anilistError, jikanError].filter(Boolean);
    if (failures.length > 0) {
      throw new ServiceUnavailableError(
        `A metaadat-források nem elérhetők: ${failures.join(' · ')}`,
      );
    }

    throw new BadRequestError(await explainMissing(anilistId, malId));
  }

  // Episode titles are a bonus, not a precondition: a project with metadata and
  // no episode list is still worth having, so a failure here does not undo the
  // rest of the import.
  let episodeList: { episodes: Awaited<ReturnType<typeof fetchJikanEpisodes>>['episodes']; truncated: boolean } = {
    episodes: [],
    truncated: false,
  };

  if (includeEpisodes && resolvedMalId) {
    try {
      episodeList = await fetchJikanEpisodes(resolvedMalId);
    } catch (error) {
      logger.warn('Az epizódlista lekérdezése sikertelen', {
        malId: resolvedMalId,
        error: describeUpstream(error),
      });
    }
  }

  return {
    ...normalizeAnime({
      anilist,
      jikan,
      episodes: episodeList.episodes,
      episodesTruncated: episodeList.truncated,
    }),
    // Surfaced so the UI can say "imported, but AniList was unreachable"
    // instead of presenting a half-filled record as a complete one.
    warnings: [
      anilistError ? `AniList: ${anilistError}` : null,
      jikanError ? `MyAnimeList: ${jikanError}` : null,
    ].filter((entry): entry is string => entry !== null),
  };
}

/**
 * Turns "not found" into something somebody can act on.
 *
 * The plain message sends people off to re-check a number that is often
 * correct. Three different situations produce it, and only one of them means
 * the id is wrong:
 *
 *   • The id belongs to a manga or novel. AniList numbers every kind of media
 *     in one sequence and the importer filters on `type: ANIME`, so a real id
 *     for the wrong kind of thing answers exactly like a fake one.
 *   • The id was typed into the other field — a MyAnimeList id in the AniList
 *     box, or the reverse. Both are plain integers, and MAL's run low enough
 *     that they are frequently valid AniList ids for something unrelated.
 *   • The id genuinely does not exist.
 *
 * The probe costs one extra request on a path that has already failed.
 */
async function explainMissing(
  anilistId: number | null | undefined,
  malId: number | null | undefined,
): Promise<string> {
  if (anilistId) {
    const probe = await probeAniListId(anilistId);

    if (probe.exists && probe.type && probe.type !== 'ANIME') {
      const name = probe.title ? ` („${probe.title}”)` : '';
      return (
        `A(z) ${anilistId} AniList-azonosító létezik, de ${probe.type} típusú bejegyzéshez ` +
        `tartozik${name}, nem animéhez. Az AniList egy számsorozatban tartja az animét és a ` +
        'mangát — nézd meg, hogy az anime oldaláról másoltad-e az azonosítót.'
      );
    }

    return (
      `A(z) ${anilistId} AniList-azonosítón nincs anime. Ellenőrizd az anime AniList-oldalának ` +
      'címét (anilist.co/anime/AZONOSÍTÓ/…), vagy keress rá a címre fent — ' +
      'lehet, hogy MyAnimeList-azonosítót írtál az AniList mezőbe.'
    );
  }

  return (
    `A(z) ${malId} MyAnimeList-azonosítón nincs anime. Ellenőrizd az anime MyAnimeList-oldalának ` +
    'címét (myanimelist.net/anime/AZONOSÍTÓ/…), vagy keress rá a címre fent.'
  );
}

/** Upstream facts. Always refreshed — see the note at the top of this file. */
function factFields(data: NormalizedAnime) {
  return {
    titleRomaji: data.titleRomaji,
    titleEnglish: data.titleEnglish,
    titleNative: data.titleNative,
    synonyms: data.synonyms,
    season: data.season,
    seasonYear: data.seasonYear,
    totalEpisodes: data.totalEpisodes,
    durationMin: data.durationMin,
    ageRating: data.ageRating,
    source: data.source,
    startDate: data.startDate,
    endDate: data.endDate,
    studio: data.studio,
    studios: data.studios,
    producers: data.producers,
    licensors: data.licensors,
    tags: data.tags,
    averageScore: data.averageScore,
    malScore: data.malScore === null ? null : new Prisma.Decimal(data.malScore),
    popularity: data.popularity,
    favourites: data.favourites,
    countryOfOrigin: data.countryOfOrigin,
    hashtag: data.hashtag,
    isAdult: data.isAdult,
    externalLinks: data.externalLinks as unknown as Prisma.InputJsonValue,
    relations: data.relations as unknown as Prisma.InputJsonValue,
    anilistId: data.anilistId,
    malId: data.malId,
    metadataSyncedAt: new Date(),
    metadataSource: data.sources.join('+').slice(0, 16),
  };
}

/**
 * Editorial fields, filtered to the ones that are currently empty.
 *
 * `overwrite` bypasses the filter for the explicit re-import action.
 */
function editorialFields(
  data: NormalizedAnime,
  current: {
    title: string;
    synopsis: string | null;
    coverImageUrl: string | null;
    bannerImageUrl: string | null;
    trailerUrl: string | null;
    accentColor: string | null;
    type: string;
  },
  overwrite: boolean,
) {
  const fill = <T>(existing: T | null | undefined, incoming: T | null): T | null | undefined =>
    overwrite || existing === null || existing === undefined || existing === ''
      ? (incoming ?? existing ?? null)
      : existing;

  return {
    synopsis: fill(current.synopsis, data.synopsis),
    coverImageUrl: fill(current.coverImageUrl, data.coverImageUrl),
    bannerImageUrl: fill(current.bannerImageUrl, data.bannerImageUrl),
    trailerUrl: fill(current.trailerUrl, data.trailerUrl),
    accentColor: fill(current.accentColor, data.accentColor),
    // The type is upstream's to know, but a team that corrected it (an ONA we
    // treat as TV) should keep the correction unless asked otherwise.
    ...(overwrite && data.type ? { type: data.type } : {}),
  };
}

/**
 * Links genres, creating any the seed did not ship.
 *
 * Existing links are left in place and only missing ones are added: a team that
 * added a genre by hand should not have it stripped by a resync, and an upstream
 * dropping a genre is not a reason to forget the team ever set it.
 */
async function syncGenres(
  tx: Prisma.TransactionClient,
  projectId: string,
  data: NormalizedAnime,
): Promise<number> {
  if (data.genres.length === 0) return 0;

  const genreIds: string[] = [];

  for (const genre of data.genres) {
    const record = await tx.genre.upsert({
      where: { slug: genre.slug },
      create: { slug: genre.slug, name: genre.name },
      // Only the slug identifies a genre; the name may already be the team's
      // Hungarian translation and must not be reverted to the English one.
      update: {},
      select: { id: true },
    });
    genreIds.push(record.id);
  }

  const existing = await tx.projectGenre.findMany({
    where: { projectId },
    select: { genreId: true },
  });
  const known = new Set(existing.map((entry) => entry.genreId));
  const missing = genreIds.filter((id) => !known.has(id));

  if (missing.length > 0) {
    await tx.projectGenre.createMany({
      data: missing.map((genreId) => ({ projectId, genreId })),
      skipDuplicates: true,
    });
  }

  return missing.length;
}

/**
 * Writes the episode list.
 *
 * Runs outside the project transaction and one row at a time on purpose: a
 * thousand-episode series inside a single transaction holds locks for as long as
 * it takes, and a partially imported list is a perfectly good outcome to resume
 * from — nothing here depends on the previous row.
 */
async function syncEpisodes(
  projectId: string,
  data: NormalizedAnime,
): Promise<{ created: number; updated: number; skipped: number }> {
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const episode of data.episodes) {
    const number = new Prisma.Decimal(episode.number);

    const existing = await db.episode.findUnique({
      where: { projectId_number: { projectId, number } },
      select: { id: true, metadataSyncedAt: true, deletedAt: true, title: true },
    });

    if (!existing) {
      await db.episode.create({
        data: {
          projectId,
          number,
          title: episode.title,
          titleRomaji: episode.titleRomaji,
          titleNative: episode.titleNative,
          airedAt: episode.airedAt,
          isFiller: episode.isFiller,
          isRecap: episode.isRecap,
          metadataSyncedAt: new Date(),
        },
      });
      created += 1;
      continue;
    }

    // Hand-written rows and soft-deleted ones are not ours to rewrite.
    if (existing.metadataSyncedAt === null || existing.deletedAt !== null) {
      skipped += 1;
      continue;
    }

    await db.episode.update({
      where: { id: existing.id },
      data: {
        /*
          `title` follows the same editorial rule as the project synopsis, and
          for a stronger reason: translating episode titles is the work. A
          nightly sync that reverted "A jövő kapuja" to "Turning Point" would
          undo the team's output on a schedule. Only an empty title is filled;
          the romaji and native titles stay upstream's, since nobody hand-writes
          those.
        */
        ...(existing.title ? {} : { title: episode.title }),
        titleRomaji: episode.titleRomaji,
        titleNative: episode.titleNative,
        airedAt: episode.airedAt,
        isFiller: episode.isFiller,
        isRecap: episode.isRecap,
        metadataSyncedAt: new Date(),
        // Workflow columns are deliberately absent: they are the team's.
      },
    });
    updated += 1;
  }

  return { created, updated, skipped };
}

/** Refreshes an existing project from its stored ids. */
export async function syncProjectMetadata(
  projectId: string,
  options: SyncOptions,
  context: MutationContext | null,
): Promise<SyncResult> {
  const project = await db.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: {
      id: true,
      slug: true,
      title: true,
      type: true,
      synopsis: true,
      coverImageUrl: true,
      bannerImageUrl: true,
      trailerUrl: true,
      accentColor: true,
      malId: true,
      anilistId: true,
    },
  });

  if (!project) throw new NotFoundError('A projekt');

  if (!project.anilistId && !project.malId) {
    throw new BadRequestError(
      'A projekthez nincs AniList- vagy MyAnimeList-azonosító, így nincs mit szinkronizálni.',
    );
  }

  const data = await lookupAnime({
    anilistId: project.anilistId,
    malId: project.malId,
    includeEpisodes: !options.skipEpisodes,
  });

  const genresLinked = await db.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: project.id },
      data: {
        ...factFields(data),
        ...editorialFields(data, project, options.overwriteEditorial ?? false),
        ...(options.overwriteEditorial ? { title: data.displayTitle } : {}),
      },
    });

    return syncGenres(tx, project.id, data);
  });

  const episodes = options.skipEpisodes
    ? { created: 0, updated: 0, skipped: 0 }
    : await syncEpisodes(project.id, data);

  invalidateProject(project.slug);

  await context?.audit({
    action: 'UPDATE',
    entityType: 'Project',
    entityId: project.id,
    summary: `Metaadat szinkronizálva: ${project.title} (${data.sources.join(', ') || 'nincs forrás'})`,
    after: {
      sources: data.sources,
      episodesCreated: episodes.created,
      episodesUpdated: episodes.updated,
    },
  });

  return {
    projectId: project.id,
    sources: data.sources,
    warnings: data.warnings,
    episodesCreated: episodes.created,
    episodesUpdated: episodes.updated,
    episodesSkipped: episodes.skipped,
    episodesTruncated: data.episodesTruncated,
    genresLinked,
  };
}

/**
 * Creates a whole project from an id.
 *
 * This is the flow the request was actually about: type one number, get a
 * project with titles, artwork, genres and every episode.
 */
export async function importProjectFromMetadata(
  params: { anilistId?: number | null; malId?: number | null; slug?: string },
  context: MutationContext,
): Promise<SyncResult & { slug: string; title: string }> {
  const data = await lookupAnime({ ...params, includeEpisodes: true });

  const existing = await db.project.findFirst({
    where: {
      deletedAt: null,
      OR: [
        ...(data.anilistId ? [{ anilistId: data.anilistId }] : []),
        ...(data.malId ? [{ malId: data.malId }] : []),
      ],
    },
    select: { id: true, title: true },
  });

  if (existing) {
    throw new ConflictError(
      `Ez az anime már szerepel a katalógusban: „${existing.title}”. Használd a szinkronizálást a frissítéshez.`,
    );
  }

  // A slug clash is resolved by suffixing rather than failing: two shows do
  // share a romaji title, and making the admin invent a slug for a one-click
  // import defeats the point of it.
  const base = params.slug?.trim() || slugify(data.displayTitle);
  let slug = base || `anime-${data.anilistId ?? data.malId}`;
  for (let attempt = 2; attempt <= 20; attempt += 1) {
    const clash = await db.project.findUnique({ where: { slug }, select: { id: true } });
    if (!clash) break;
    slug = `${base}-${attempt}`;
  }

  const project = await db.project.create({
    data: {
      slug,
      title: data.displayTitle,
      type: data.type ?? 'TV',
      status: data.seedStatus ?? 'ANNOUNCED',
      // Imported as a draft, always. An import is a starting point that still
      // needs a Hungarian title and a team decision; publishing it the moment
      // it lands would put a machine-filled page on the public site.
      publishStatus: 'DRAFT',
      synopsis: data.synopsis,
      coverImageUrl: data.coverImageUrl,
      bannerImageUrl: data.bannerImageUrl,
      trailerUrl: data.trailerUrl,
      accentColor: data.accentColor,
      createdById: context.actor.id,
      ...factFields(data),
    },
    select: { id: true, slug: true, title: true },
  });

  const genresLinked = await db.$transaction((tx) => syncGenres(tx, project.id, data));
  const episodes = await syncEpisodes(project.id, data);

  invalidateProject(project.slug);

  await context.audit({
    action: 'CREATE',
    entityType: 'Project',
    entityId: project.id,
    summary: `Projekt importálva: ${project.title} (${data.sources.join(', ')})`,
    after: { anilistId: data.anilistId, malId: data.malId, episodes: episodes.created },
  });

  return {
    projectId: project.id,
    slug: project.slug,
    title: project.title,
    sources: data.sources,
    warnings: data.warnings,
    episodesCreated: episodes.created,
    episodesUpdated: episodes.updated,
    episodesSkipped: episodes.skipped,
    episodesTruncated: data.episodesTruncated,
    genresLinked,
  };
}

/**
 * Scheduled resync.
 *
 * Ordered by staleness and capped per run, so the nightly job spends a
 * predictable slice of the upstream rate limit instead of walking the whole
 * catalogue. Projects the team pinned with `autoSync: false` are skipped, as are
 * ones with no upstream id to sync against.
 *
 * One project failing does not stop the run: a single dead MAL entry should not
 * mean nothing else gets refreshed tonight.
 */
export async function runScheduledSync(limit = 20): Promise<{
  attempted: number;
  succeeded: number;
  failed: Array<{ projectId: string; error: string }>;
}> {
  const projects = await db.project.findMany({
    where: {
      deletedAt: null,
      autoSync: true,
      OR: [{ anilistId: { not: null } }, { malId: { not: null } }],
    },
    // Nulls first: a project that has never synced is the most urgent.
    orderBy: [{ metadataSyncedAt: { sort: 'asc', nulls: 'first' } }],
    take: limit,
    select: { id: true },
  });

  const failed: Array<{ projectId: string; error: string }> = [];
  let succeeded = 0;

  for (const project of projects) {
    try {
      await syncProjectMetadata(project.id, {}, null);
      succeeded += 1;
    } catch (error) {
      failed.push({
        projectId: project.id,
        error: error instanceof Error ? error.message : 'ismeretlen hiba',
      });
    }
  }

  return { attempted: projects.length, succeeded, failed };
}
