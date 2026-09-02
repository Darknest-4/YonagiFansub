import 'server-only';
import { db } from '@/infrastructure/db';
import { CACHE_TAGS, invalidate } from '@/infrastructure/cache';
import { NotFoundError } from '@/shared/lib/errors';
import { assertFeatureEnabled } from '@/features/settings/service';
import { requirePublishedProject } from '@/features/projects/queries';

const RATINGS_DISABLED = 'Az értékelés jelenleg ki van kapcsolva ezen az oldalon.';

/**
 * Watch progress and ratings — the two things a viewer contributes back.
 *
 * ## Why progress is a single upsert
 *
 * The player reports a position every so often, which means this is a write
 * path that runs while somebody is watching. It has to be cheap, idempotent, and
 * proof against the one report that would do damage: a page reload announcing
 * position `0` before the player has restored anything.
 *
 * That guard lives here rather than in the client, because the client is one of
 * several possible callers and the only one a viewer can edit.
 */

/** Past this fraction, an episode counts as watched even if the last minute is credits. */
const COMPLETION_RATIO = 0.9;

/** Below this, a reported position is treated as "the player has not started yet". */
const RESET_THRESHOLD_SEC = 5;

/**
 * Which position to store, given what is on record and what was just reported.
 *
 * The one case that has to be wrong-proof is a **reload**. A fresh page reports
 * position 0 before the player has restored anything, and storing that would
 * erase where somebody actually was — the exact failure this whole feature
 * exists to prevent.
 *
 * So a near-zero report never overwrites real progress. Everything else is
 * accepted as-is, *including a deliberate seek backwards*: the viewer is the
 * authority on where they are, and second-guessing a rewind would be a worse
 * bug than the one being avoided.
 *
 * A genuine restart-from-the-top is the only thing this costs, and it costs
 * almost nothing — a few seconds later the player reports a real position and
 * the record corrects itself.
 */
export function nextPosition(current: number, reported: number): number {
  const isProbablyAReload = reported < RESET_THRESHOLD_SEC && current >= RESET_THRESHOLD_SEC;
  return isProbablyAReload ? current : reported;
}

export interface ProgressInput {
  userId: string;
  episodeId: string;
  positionSec: number;
  /** Total length, when the player knows it. Used to decide completion. */
  durationSec?: number | null;
  /** Set by the viewer's own "mark as watched" toggle, which overrides the ratio. */
  completed?: boolean;
}

export async function recordProgress(input: ProgressInput): Promise<void> {
  const position = Math.max(0, Math.round(input.positionSec));

  const completed =
    input.completed ??
    (input.durationSec ? position >= input.durationSec * COMPLETION_RATIO : false);

  await db.$transaction(async (tx) => {
    const current = await tx.watchProgress.findUnique({
      where: { userId_episodeId: { userId: input.userId, episodeId: input.episodeId } },
      select: { positionSec: true, completed: true },
    });

    if (!current) {
      await tx.watchProgress.create({
        data: {
          userId: input.userId,
          episodeId: input.episodeId,
          positionSec: position,
          completed,
        },
      });
      return;
    }

    await tx.watchProgress.update({
      where: { userId_episodeId: { userId: input.userId, episodeId: input.episodeId } },
      data: {
        positionSec: nextPosition(current.positionSec, position),
        // Once watched, always watched — until the viewer says otherwise.
        completed: input.completed ?? (current.completed || completed),
      },
    });
  });
}

/** Progress for one project's episodes, keyed by episode id. */
export async function getProjectProgress(
  userId: string,
  projectId: string,
): Promise<Map<string, { positionSec: number; completed: boolean }>> {
  const rows = await db.watchProgress.findMany({
    where: { userId, episode: { projectId } },
    select: { episodeId: true, positionSec: true, completed: true },
  });

  return new Map(rows.map((row) => [row.episodeId, row]));
}

/**
 * "Where I left off."
 *
 * Deliberately excludes finished episodes: an episode somebody watched to the
 * end is not something to resume, and a continue-watching list full of things
 * already seen is a list nobody looks at twice.
 */
export async function getContinueWatching(userId: string, limit = 6) {
  return db.watchProgress.findMany({
    where: {
      userId,
      completed: false,
      positionSec: { gt: 30 },
      episode: { deletedAt: null, status: 'RELEASED', project: { deletedAt: null } },
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: {
      positionSec: true,
      updatedAt: true,
      episode: {
        select: {
          id: true,
          number: true,
          title: true,
          durationSec: true,
          thumbnailUrl: true,
          project: { select: { slug: true, title: true, coverImageUrl: true } },
        },
      },
    },
  });
}

// ── Ratings ──────────────────────────────────────────────────────────────────

export interface RatingSummary {
  /** Mean score, or null when nobody has voted. */
  average: number | null;
  count: number;
  /** The signed-in viewer's own score, when there is one. */
  mine: number | null;
}

/**
 * Aggregate plus the viewer's own vote, in one place.
 *
 * Returned together because the UI always needs both: an average with no
 * indication of whether you voted invites you to vote again, and a personal
 * score with no average tells you nothing.
 */
export async function getRatingSummary(
  projectId: string,
  userId?: string | null,
): Promise<RatingSummary> {
  const [aggregate, mine] = await Promise.all([
    db.rating.aggregate({
      where: { projectId },
      _avg: { score: true },
      _count: { score: true },
    }),
    userId
      ? db.rating.findUnique({
          where: { userId_projectId: { userId, projectId } },
          select: { score: true },
        })
      : null,
  ]);

  return {
    average: aggregate._avg.score,
    count: aggregate._count.score,
    mine: mine?.score ?? null,
  };
}

export async function setRating(
  userId: string,
  projectId: string,
  score: number,
): Promise<RatingSummary> {
  await db.rating.upsert({
    where: { userId_projectId: { userId, projectId } },
    create: { userId, projectId, score },
    update: { score },
  });

  return getRatingSummary(projectId, userId);
}

export async function clearRating(userId: string, projectId: string): Promise<RatingSummary> {
  await db.rating
    .delete({ where: { userId_projectId: { userId, projectId } } })
    // Deleting a vote that is not there is the same outcome as deleting one
    // that is: no vote. Not an error worth surfacing.
    .catch(() => undefined);

  return getRatingSummary(projectId, userId);
}

// ── A végpontok belépési pontjai ─────────────────────────────────────────────

/**
 * A lejátszó jelentésének teljes útja: kapcsoló, létezés, mentés.
 *
 * A három lépés együtt tartozik, és eddig a route-fájlban állt egymás alatt.
 * Így viszont a szabály — hogy kikapcsolt funkciónál nem mentünk, és hogy nem
 * létező epizódra nem írunk — a domainben van, nem a HTTP-rétegben.
 *
 * Az epizódot azért ellenőrizzük, és nem bízzuk az útvonalra: idegen kulcs
 * mindkét esetben, de egy hiányzó sor 404 legyen, ne egy 500-nak öltözött
 * megszorítás-hiba.
 */
export async function saveWatchProgress(input: ProgressInput): Promise<{ saved: true }> {
  await assertFeatureEnabled(
    'watchProgressEnabled',
    'A nézési előrehaladás mentése jelenleg ki van kapcsolva.',
  );

  const episode = await db.episode.findFirst({
    where: { id: input.episodeId, deletedAt: null },
    select: { id: true },
  });
  if (!episode) throw new NotFoundError('Az epizód');

  await recordProgress(input);
  return { saved: true };
}

/** A néző saját „mégsem néztem" kapcsolója. */
export async function forgetWatchProgress(
  userId: string,
  episodeId: string,
): Promise<{ saved: true }> {
  // `deleteMany`: a nem létező sor törlése a kért végállapot, nem hiba.
  await db.watchProgress.deleteMany({ where: { userId, episodeId } });
  return { saved: true };
}

/**
 * Értékelés leadása vagy módosítása, a projekt ellenőrzésével együtt.
 *
 * Az ürítés is itt van: a projektoldal az átlagot jeleníti meg, és az
 * gyorsítótárazott. Ha ez a route-ban maradna, egy második hívó könnyen
 * kihagyná — és az átlag napokig állna egy rossz értéken.
 */
export async function rateProject(
  userId: string,
  projectId: string,
  score: number,
): Promise<RatingSummary> {
  await assertFeatureEnabled('ratingsEnabled', RATINGS_DISABLED);
  const { slug } = await requirePublishedProject(projectId);

  const summary = await setRating(userId, projectId, score);
  invalidate(CACHE_TAGS.project(slug), CACHE_TAGS.projects);
  return summary;
}

export async function unrateProject(userId: string, projectId: string): Promise<RatingSummary> {
  await assertFeatureEnabled('ratingsEnabled', RATINGS_DISABLED);
  const { slug } = await requirePublishedProject(projectId);

  const summary = await clearRating(userId, projectId);
  invalidate(CACHE_TAGS.project(slug), CACHE_TAGS.projects);
  return summary;
}

/** A publikus állás — annak, aki oldalfrissítés nélkül kérdezi. */
export async function readProjectRating(
  projectId: string,
  userId: string | null,
): Promise<RatingSummary> {
  await requirePublishedProject(projectId);
  return getRatingSummary(projectId, userId);
}
