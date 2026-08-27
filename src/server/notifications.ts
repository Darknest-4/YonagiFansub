import 'server-only';
import type { NotificationType } from '@prisma/client';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { mailTemplates, sendMail } from '@/lib/mail';

/**
 * Notifications.
 *
 * In-app notifications are written synchronously (they are one cheap insert);
 * email fan-out is chunked and detached, because a project with 5 000 followers
 * must not turn "publish release" into a 30-second request.
 *
 * `docs/architecture.md` describes the queue-backed upgrade path: the same
 * `notifyNewRelease` interface, with the fan-out handed to a worker.
 */

const EMAIL_CHUNK_SIZE = 50;

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  href?: string;
  imageUrl?: string;
  meta?: Record<string, unknown>;
}

export async function notify(input: NotifyInput): Promise<void> {
  await db.notification
    .create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title.slice(0, 200),
        body: input.body?.slice(0, 500) ?? null,
        href: input.href ?? null,
        imageUrl: input.imageUrl ?? null,
        meta: (input.meta ?? {}) as never,
      },
    })
    .catch((error) => logger.error('Notification insert failed', error, { userId: input.userId }));
}

export async function notifyMany(inputs: NotifyInput[]): Promise<number> {
  if (inputs.length === 0) return 0;

  const result = await db.notification.createMany({
    data: inputs.map((input) => ({
      userId: input.userId,
      type: input.type,
      title: input.title.slice(0, 200),
      body: input.body?.slice(0, 500) ?? null,
      href: input.href ?? null,
      imageUrl: input.imageUrl ?? null,
      meta: (input.meta ?? {}) as never,
    })),
  });

  return result.count;
}

/**
 * Fan-out for a new release.
 *
 * Targets the users who favourited the project *and* left release notifications
 * on. Both conditions are in the query, so an opted-out follower never costs a
 * row or an email.
 */
export async function notifyNewRelease(releaseId: string): Promise<{ notified: number }> {
  const release = await db.release.findUnique({
    where: { id: releaseId },
    select: {
      id: true,
      version: true,
      resolution: true,
      episode: { select: { number: true, title: true } },
      project: {
        select: {
          id: true,
          slug: true,
          title: true,
          coverImageUrl: true,
        },
      },
    },
  });

  if (!release) return { notified: 0 };

  const followers = await db.favorite.findMany({
    where: {
      projectId: release.project.id,
      notify: true,
      user: { deletedAt: null, status: 'ACTIVE' },
    },
    select: {
      user: {
        select: { id: true, email: true, displayName: true, preferences: true },
      },
    },
  });

  if (followers.length === 0) return { notified: 0 };

  const episodeLabel = release.episode
    ? `${release.episode.number.toString().replace(/\.00$/, '')}. rész`
    : 'új kiadás';
  const versionLabel = release.version > 1 ? ` (v${release.version})` : '';
  const label = `${episodeLabel}${versionLabel}`;
  const href = `/projektek/${release.project.slug}`;

  const notified = await notifyMany(
    followers.map(({ user }) => ({
      userId: user.id,
      type: 'NEW_RELEASE' as const,
      title: `Új kiadás: ${release.project.title}`,
      body: label,
      href,
      imageUrl: release.project.coverImageUrl ?? undefined,
      meta: { projectId: release.project.id, releaseId: release.id },
    })),
  );

  // Email fan-out: detached, chunked, and only for users who asked for it.
  const emailTargets = followers
    .map(({ user }) => user)
    .filter((user) => {
      const preferences = (user.preferences ?? {}) as { notifyNewRelease?: boolean };
      return preferences.notifyNewRelease !== false;
    });

  void dispatchReleaseEmails(emailTargets, release.project.title, label, href).catch((error) =>
    logger.error('Release email fan-out failed', error, { releaseId }),
  );

  return { notified };
}

async function dispatchReleaseEmails(
  users: Array<{ email: string; displayName: string }>,
  projectTitle: string,
  label: string,
  path: string,
): Promise<void> {
  const url = `${env.NEXT_PUBLIC_SITE_URL}${path}`;

  for (let index = 0; index < users.length; index += EMAIL_CHUNK_SIZE) {
    const chunk = users.slice(index, index + EMAIL_CHUNK_SIZE);
    await Promise.all(
      chunk.map((user) =>
        sendMail({
          to: user.email,
          ...mailTemplates.newRelease(user.displayName, projectTitle, label, url),
        }),
      ),
    );
  }

  logger.info('Release notification emails dispatched', { count: users.length, projectTitle });
}

export async function listNotifications(
  userId: string,
  options: { limit?: number; unreadOnly?: boolean } = {},
) {
  return db.notification.findMany({
    where: { userId, ...(options.unreadOnly ? { readAt: null } : {}) },
    orderBy: { createdAt: 'desc' },
    take: options.limit ?? 20,
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      href: true,
      imageUrl: true,
      readAt: true,
      createdAt: true,
    },
  });
}

export async function countUnread(userId: string): Promise<number> {
  return db.notification.count({ where: { userId, readAt: null } });
}

export async function markRead(userId: string, ids?: string[]): Promise<number> {
  const result = await db.notification.updateMany({
    where: { userId, readAt: null, ...(ids?.length ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  });
  return result.count;
}

/** Retention: notifications older than the window are pruned nightly. */
export async function pruneNotifications(retentionDays = 90): Promise<number> {
  const result = await db.notification.deleteMany({
    where: {
      createdAt: { lt: new Date(Date.now() - retentionDays * 86_400_000) },
      readAt: { not: null },
    },
  });
  return result.count;
}
