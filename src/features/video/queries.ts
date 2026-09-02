import 'server-only';
import { db } from '@/infrastructure/db';
import type { VideoSourceKind } from '@prisma/client';
import { NotFoundError } from '@/shared/lib/errors';

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
  kind: VideoSourceKind;
  masterKey: string | null;
  externalId: string | null;
  sourceUrl: string | null;
  proxied: boolean;
  allowPopups: boolean;
  requiresAuth: boolean;
  durationSec: number | null;
  label: string | null;
  episodeId: string;
  projectSlug: string;
  episodeNumber: string;
  projectTitle: string;
  episodeTitle: string | null;
  provider: {
    slug: string;
    name: string;
    embedTemplate: string | null;
    urlPatterns: string[];
    domains: string[];
  } | null;
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
      kind: true,
      masterKey: true,
      externalId: true,
      sourceUrl: true,
      proxied: true,
      allowPopups: true,
      requiresAuth: true,
      durationSec: true,
      label: true,
      episodeId: true,
      provider: {
        select: {
          slug: true,
          name: true,
          embedTemplate: true,
          urlPatterns: true,
          domains: true,
          allowPopups: true,
          isEnabled: true,
        },
      },
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

  // A disabled provider takes its sources offline with it: turning one off is
  // how a team reacts to a host going bad, and it would be useless if the
  // sources it serves kept playing.
  if (video.provider && !video.provider.isEnabled) return null;

  return {
    id: video.id,
    kind: video.kind,
    masterKey: video.masterKey,
    externalId: video.externalId,
    sourceUrl: video.sourceUrl,
    proxied: video.proxied,
    // Per-source override wins; otherwise the provider's own setting.
    allowPopups: video.allowPopups ?? video.provider?.allowPopups ?? false,
    provider: video.provider
      ? {
          slug: video.provider.slug,
          name: video.provider.name,
          embedTemplate: video.provider.embedTemplate,
          urlPatterns: video.provider.urlPatterns,
          domains: video.provider.domains,
        }
      : null,
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

/**
 * Published sources for one episode, in fallback order.
 *
 * Ordered by `sortOrder` rather than resolution: which source is *reliable* is
 * not the same question as which is sharpest, and the team knows the answer.
 * Sources whose provider has been disabled are dropped here so the player never
 * offers one that cannot play.
 */
export async function listEpisodeVideos(episodeId: string) {
  const sources = await db.videoSource.findMany({
    where: {
      episodeId,
      deletedAt: null,
      status: 'PUBLISHED',
      OR: [{ providerId: null }, { provider: { isEnabled: true } }],
    },
    select: {
      id: true,
      kind: true,
      label: true,
      resolution: true,
      durationSec: true,
      requiresAuth: true,
      provider: { select: { name: true, slug: true, color: true } },
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });

  return sources;
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
