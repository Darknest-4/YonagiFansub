import 'server-only';
import { db } from '@/infrastructure/db';
import { NotFoundError } from '@/shared/lib/errors';
import { assertFeatureEnabled } from '@/features/settings/service';
import {
  RESOLUTION_TO_QUALITY,
  resolvePlaybackChain,
  type QualityRequest,
  type QualityStep,
  type ResolvableSource,
  type ResolveOutcome,
} from '@/features/video/resolver';

/**
 * A lejátszás összeállítása egy epizódhoz.
 *
 * Ez köti össze a tiszta feloldót az adatbázissal, és ez az egyetlen hely, ahol
 * a kettő találkozik. A feloldó nem tud a Prismáról, ez a fájl pedig nem hoz
 * döntést — csak összegyűjti a jeleket, átadja, és a választ lejátszható
 * alakra fordítja.
 *
 * ## Amit a böngésző megkap, és amit nem
 *
 * A válaszban **nincs** forrás-URL, tárolási kulcs, szolgáltatói azonosító és
 * beágyazási sablon. Ami van: a lánc elemeinek azonosítója, a minőségük, és egy
 * rövid életű, nézőhöz kötött hivatkozás. A tényleges cím a `/api/v1/watch/…`
 * végpontokon áll elő, kérésenként újra — így egy kimásolt válasz percekkel
 * később már semmit nem ér.
 */

export interface PlaybackCandidate {
  sourceId: string;
  quality: QualityStep;
  isRequestedQuality: boolean;
  /** Emberi címke a minőségválasztóhoz: „1080p — Saját tárhely". */
  label: string;
  providerName: string | null;
  isAdaptive: boolean;
}

export interface EpisodeMarkers {
  introStartSec: number | null;
  introEndSec: number | null;
  outroStartSec: number | null;
  outroEndSec: number | null;
}

export interface SubtitleTrackInfo {
  id: string;
  language: string;
  label: string;
  format: 'ASS' | 'SSA' | 'SRT' | 'VTT';
  isDefault: boolean;
  isForced: boolean;
  isHearingImpaired: boolean;
  /** Saját végpont; a tárolási kulcs sosem kerül ki. */
  url: string;
}

export interface EpisodeNeighbour {
  number: string;
  title: string | null;
  href: string;
}

export interface PlaybackManifest {
  episodeId: string;
  projectSlug: string;
  episodeNumber: string;
  title: string;
  durationSec: number | null;
  posterUrl: string | null;

  /** A teljes visszaesési lánc, a legjobbtól lefelé. */
  chain: PlaybackCandidate[];
  /** Amit a minőségválasztó felajánlhat. */
  availableQualities: QualityStep[];
  /** Amit ténylegesen kiszolgálunk — eltérhet a kérttől, és a felület kimondja. */
  resolvedQuality: QualityStep | null;

  markers: EpisodeMarkers;
  subtitles: SubtitleTrackInfo[];

  previousEpisode: EpisodeNeighbour | null;
  nextEpisode: EpisodeNeighbour | null;

  /** Hol tartott a néző. `null`, ha nincs mentett állás. */
  resumeAtSec: number | null;
}

/** Az epizód sorszáma szövegként — a Decimal `12.50` helyett `12.5`. */
function episodeNumber(value: { toString(): string }): string {
  return String(Number(value.toString()));
}

/**
 * A forrássorok átfordítása arra, amit a feloldó ért.
 *
 * Külön lépés, és nem a lekérdezésbe olvasztva: így a feloldó bemenete egy
 * kézzel megírható, tesztelhető alak marad, nem egy Prisma-eredmény, amit csak
 * adatbázissal lehetne előállítani.
 */
function toResolvable(row: {
  id: string;
  resolution: string;
  isAdaptive: boolean;
  bitrateKbps: number | null;
  requiresAuth: boolean;
  sortOrder: number;
  providerId: string | null;
  provider: {
    priority: number;
    isEnabled: boolean;
    health: { status: string; failureCount: number; averageLatencyMs: number | null } | null;
  } | null;
  health: { status: string; failureCount: number; averageLatencyMs: number | null } | null;
}): ResolvableSource {
  const snapshot = (
    value: { status: string; failureCount: number; averageLatencyMs: number | null } | null,
  ) =>
    value
      ? {
          status: value.status as ResolvableSource['health']['status'],
          failureCount: value.failureCount,
          averageLatencyMs: value.averageLatencyMs,
        }
      : { status: 'UNKNOWN' as const, failureCount: 0, averageLatencyMs: null };

  return {
    id: row.id,
    quality: RESOLUTION_TO_QUALITY[row.resolution] ?? '1080p',
    isAdaptive: row.isAdaptive,
    bitrateKbps: row.bitrateKbps,
    requiresAuth: row.requiresAuth,
    sortOrder: row.sortOrder,
    providerId: row.providerId,
    // Szolgáltató nélküli forrás a saját tárhelyünk: az megy legelöl.
    providerPriority: row.provider?.priority ?? 0,
    providerEnabled: row.provider?.isEnabled ?? true,
    health: snapshot(row.health),
    providerHealth: row.provider ? snapshot(row.provider.health) : null,
  };
}

export interface PlaybackRequest {
  episodeId: string;
  quality: QualityRequest;
  userId: string | null;
  excludeSourceIds?: readonly string[];
}

/**
 * A lejátszási terv összeállítása.
 *
 * A láthatóság a teljes láncra vonatkozik: nem publikált projekt epizódja akkor
 * sem érhető el, ha véletlenül videót kapcsoltak hozzá. Ezt itt egyszer
 * mondjuk ki, és nem a végponton — a szabály a domainé.
 */
export async function buildPlaybackManifest(
  request: PlaybackRequest,
): Promise<PlaybackManifest> {
  const episode = await db.episode.findFirst({
    where: {
      id: request.episodeId,
      deletedAt: null,
      status: 'RELEASED',
      project: { deletedAt: null, publishStatus: 'PUBLISHED' },
    },
    select: {
      id: true,
      number: true,
      title: true,
      durationSec: true,
      thumbnailUrl: true,
      introStartSec: true,
      introEndSec: true,
      outroStartSec: true,
      outroEndSec: true,
      projectId: true,
      project: { select: { slug: true, title: true, coverImageUrl: true } },
      videos: {
        where: { deletedAt: null, status: 'PUBLISHED' },
        select: {
          id: true,
          resolution: true,
          isAdaptive: true,
          bitrateKbps: true,
          requiresAuth: true,
          sortOrder: true,
          label: true,
          providerId: true,
          provider: {
            select: {
              name: true,
              priority: true,
              isEnabled: true,
              health: {
                select: { status: true, failureCount: true, averageLatencyMs: true },
              },
            },
          },
          health: { select: { status: true, failureCount: true, averageLatencyMs: true } },
        },
      },
      subtitles: {
        where: { deletedAt: null, status: 'PUBLISHED' },
        orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
        select: {
          id: true,
          language: true,
          label: true,
          format: true,
          isDefault: true,
          isForced: true,
          isHearingImpaired: true,
        },
      },
    },
  });

  if (!episode) throw new NotFoundError('Az epizód');

  const outcome: ResolveOutcome = resolvePlaybackChain(
    episode.videos.map(toResolvable),
    {
      quality: request.quality,
      isAuthenticated: request.userId !== null,
      excludeSourceIds: request.excludeSourceIds,
    },
  );

  const byId = new Map(episode.videos.map((video) => [video.id, video]));

  const chain: PlaybackCandidate[] = outcome.chain.map((entry) => {
    const row = byId.get(entry.source.id);
    const provider = row?.provider?.name ?? null;
    return {
      sourceId: entry.source.id,
      quality: entry.quality,
      isRequestedQuality: entry.isRequestedQuality,
      label: row?.label ?? `${entry.quality}${provider ? ` — ${provider}` : ''}`,
      providerName: provider,
      isAdaptive: entry.source.isAdaptive,
    };
  });

  const [neighbours, progress] = await Promise.all([
    findNeighbours(episode.projectId, episode.project.slug, episode.number),
    request.userId
      ? db.watchProgress.findUnique({
          where: { userId_episodeId: { userId: request.userId, episodeId: episode.id } },
          select: { positionSec: true, completed: true },
        })
      : null,
  ]);

  return {
    episodeId: episode.id,
    projectSlug: episode.project.slug,
    episodeNumber: episodeNumber(episode.number),
    title: `${episode.project.title} — ${episodeNumber(episode.number)}. rész`,
    durationSec: episode.durationSec,
    posterUrl: episode.thumbnailUrl ?? episode.project.coverImageUrl,

    chain,
    availableQualities: outcome.availableQualities,
    resolvedQuality: chain[0]?.quality ?? null,

    markers: {
      introStartSec: episode.introStartSec,
      introEndSec: episode.introEndSec,
      outroStartSec: episode.outroStartSec,
      outroEndSec: episode.outroEndSec,
    },

    subtitles: episode.subtitles.map((track) => ({
      id: track.id,
      language: track.language,
      label: track.label,
      format: track.format,
      isDefault: track.isDefault,
      isForced: track.isForced,
      isHearingImpaired: track.isHearingImpaired,
      url: `/api/v1/subtitles/${track.id}`,
    })),

    previousEpisode: neighbours.previous,
    nextEpisode: neighbours.next,

    /*
      A befejezett részt nem ajánljuk folytatásra.

      Aki végignézte, és újra megnyitja, az elölről akarja — a „folytatás
      23:41-től" ott pont az utolsó pillanatra dobná, ahonnan már nincs tovább.
    */
    resumeAtSec: progress && !progress.completed ? progress.positionSec : null,
  };
}

async function findNeighbours(projectId: string, projectSlug: string, number: unknown) {
  const [previous, next] = await Promise.all([
    db.episode.findFirst({
      where: {
        projectId,
        deletedAt: null,
        status: 'RELEASED',
        number: { lt: number as never },
      },
      orderBy: { number: 'desc' },
      select: { number: true, title: true },
    }),
    db.episode.findFirst({
      where: {
        projectId,
        deletedAt: null,
        status: 'RELEASED',
        number: { gt: number as never },
      },
      orderBy: { number: 'asc' },
      select: { number: true, title: true },
    }),
  ]);

  const link = (row: { number: { toString(): string }; title: string | null } | null) =>
    row
      ? {
          number: episodeNumber(row.number),
          title: row.title,
          href: `/projektek/${projectSlug}/${episodeNumber(row.number)}`,
        }
      : null;

  return { previous: link(previous), next: link(next) };
}

/**
 * A funkciókapcsoló ellenőrzése a lejátszás előtt.
 *
 * Külön függvény, mert két hívó van — a végpont és az oldal —, és a kettőnek
 * ugyanazt a hibaüzenetet kell adnia.
 */
export async function assertPlaybackEnabled(): Promise<void> {
  await assertFeatureEnabled('watchEnabled', 'Az online nézés jelenleg ki van kapcsolva.');
}
