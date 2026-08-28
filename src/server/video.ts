import 'server-only';
import { db } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';

/**
 * Playback read model.
 *
 * Everything here answers one question: may *this* viewer play *this* episode,
 * and from which storage key. The answer is recomputed on every playlist and
 * segment request rather than trusted from a token, because a token is issued
 * once and a release can be unpublished at any moment — an authorisation that
 * outlives the thing it authorises is not an authorisation.
 */

export interface PlayableVideo {
  id: string;
  masterKey: string;
  requiresAuth: boolean;
  durationSec: number | null;
  label: string | null;
  episodeId: string;
  projectSlug: string;
  episodeNumber: string;
  projectTitle: string;
  episodeTitle: string | null;
}

/**
 * Resolves a video source that is genuinely publicly playable.
 *
 * The whole chain has to be published, not just the video: an episode inside an
 * unpublished project must not become reachable because somebody attached a
 * video to it, and a soft-deleted anything is gone.
 */
export async function getPlayableVideo(videoId: string): Promise<PlayableVideo | null> {
  const video = await db.videoSource.findFirst({
    where: {
      id: videoId,
      deletedAt: null,
      status: 'PUBLISHED',
      episode: {
        deletedAt: null,
        project: { deletedAt: null, publishStatus: 'PUBLISHED' },
      },
    },
    select: {
      id: true,
      masterKey: true,
      requiresAuth: true,
      durationSec: true,
      label: true,
      episodeId: true,
      episode: {
        select: {
          number: true,
          title: true,
          project: { select: { slug: true, title: true } },
        },
      },
    },
  });

  if (!video) return null;

  return {
    id: video.id,
    masterKey: video.masterKey,
    requiresAuth: video.requiresAuth,
    durationSec: video.durationSec,
    label: video.label,
    episodeId: video.episodeId,
    projectSlug: video.episode.project.slug,
    projectTitle: video.episode.project.title,
    episodeNumber: video.episode.number.toString().replace(/\.00$/, ''),
    episodeTitle: video.episode.title,
  };
}

/** Published video sources for one episode, best first. */
export async function listEpisodeVideos(episodeId: string) {
  return db.videoSource.findMany({
    where: { episodeId, deletedAt: null, status: 'PUBLISHED' },
    select: {
      id: true,
      label: true,
      resolution: true,
      durationSec: true,
      requiresAuth: true,
    },
    orderBy: [{ resolution: 'asc' }, { createdAt: 'asc' }],
  });
}

export async function getAdminVideo(id: string) {
  const video = await db.videoSource.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      episodeId: true,
      masterKey: true,
      label: true,
      resolution: true,
      durationSec: true,
      requiresAuth: true,
      status: true,
      viewCount: true,
      createdAt: true,
    },
  });
  if (!video) throw new NotFoundError('A videóforrás');
  return video;
}

/**
 * Counts a view.
 *
 * Fired when the master playlist is handed out, not per segment — a segment
 * counter would report a number roughly equal to the episode's length in
 * seconds, which is a measure of nothing.
 *
 * Failure is swallowed: a statistic must never be the reason playback stops.
 */
export async function recordView(videoId: string): Promise<void> {
  try {
    await db.videoSource.update({
      where: { id: videoId },
      data: { viewCount: { increment: 1 } },
    });
  } catch {
    // Intentionally ignored — see above.
  }
}
