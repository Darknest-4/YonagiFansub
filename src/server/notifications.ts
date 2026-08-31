import 'server-only';
import type { NotificationType, ProjectStatus } from '@prisma/client';
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

/** Recipients per page when the audience is "everyone" rather than a follower list. */
const RECIPIENT_PAGE_SIZE = 500;

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

/**
 * Fan-out for a published news post.
 *
 * Unlike a release, a news post has no followers — it goes to everyone with an
 * active account. That makes the size of the job unbounded in a way the release
 * path is not, so recipients are walked in pages rather than loaded at once: a
 * site with twenty thousand members must not need twenty thousand user rows in
 * memory to announce a blog post.
 *
 * **The claim comes first.** `notifiedAt` is set before a single row is written,
 * with a conditional update that only one caller can win. Two publishes racing
 * (the admin button and the scheduled job, say) therefore produce one
 * announcement, not two — and if the fan-out then fails halfway, the failure is
 * a missing notification rather than a second one arriving tomorrow. Given the
 * choice, under-notifying is the kinder error.
 */
export async function notifyNewsPost(postId: string): Promise<{ notified: number }> {
  const post = await db.newsPost.findFirst({
    where: { id: postId, status: 'PUBLISHED', deletedAt: null, notifiedAt: null },
    select: { id: true, slug: true, title: true, excerpt: true, coverImageUrl: true },
  });

  if (!post) return { notified: 0 };

  // Claim it. `notifiedAt: null` in the filter is the lock: the second caller
  // updates zero rows and stops here.
  const claim = await db.newsPost.updateMany({
    where: { id: post.id, notifiedAt: null },
    data: { notifiedAt: new Date() },
  });
  if (claim.count === 0) return { notified: 0 };

  const href = `/hirek/${post.slug}`;
  const emailTargets: Array<{ email: string; displayName: string }> = [];
  let notified = 0;
  let cursor: string | undefined;

  for (;;) {
    const page = await db.user.findMany({
      where: { deletedAt: null, status: 'ACTIVE' },
      select: { id: true, email: true, displayName: true, preferences: true },
      orderBy: { id: 'asc' },
      take: RECIPIENT_PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    if (page.length === 0) break;

    notified += await notifyMany(
      page.map((user) => ({
        userId: user.id,
        type: 'NEWS_POST' as const,
        title: post.title,
        body: post.excerpt ?? undefined,
        href,
        imageUrl: post.coverImageUrl ?? undefined,
        meta: { newsPostId: post.id },
      })),
    );

    for (const user of page) {
      const preferences = (user.preferences ?? {}) as { notifyNewsPost?: boolean };
      // Opt-out, not opt-in: the setting defaults on, so an absent value means yes.
      if (preferences.notifyNewsPost !== false) {
        emailTargets.push({ email: user.email, displayName: user.displayName });
      }
    }

    cursor = page.at(-1)?.id;
    if (page.length < RECIPIENT_PAGE_SIZE) break;
  }

  void dispatchNewsEmails(emailTargets, post.title, post.excerpt, href).catch((error) =>
    logger.error('News email fan-out failed', error, { postId }),
  );

  return { notified };
}

async function dispatchNewsEmails(
  users: Array<{ email: string; displayName: string }>,
  title: string,
  excerpt: string | null,
  path: string,
): Promise<void> {
  if (users.length === 0) return;

  const url = `${env.NEXT_PUBLIC_SITE_URL}${path}`;

  for (let index = 0; index < users.length; index += EMAIL_CHUNK_SIZE) {
    const chunk = users.slice(index, index + EMAIL_CHUNK_SIZE);
    await Promise.all(
      chunk.map((user) =>
        sendMail({ to: user.email, ...mailTemplates.newsPost(user.displayName, title, excerpt, url) }),
      ),
    );
  }

  logger.info('News notification emails dispatched', { count: users.length, title });
}

/** Human wording for the states a follower would want to hear about. */
const PROJECT_STATUS_MESSAGE: Partial<Record<ProjectStatus, string>> = {
  ONGOING: 'Elindult a projekt — jönnek a részek.',
  COMPLETED: 'Kész van! Az utolsó rész is megjelent.',
  ON_HOLD: 'A projekt egyelőre szünetel.',
  DROPPED: 'A projektet sajnos nem folytatjuk.',
};

/**
 * Tells followers that a project they follow changed state.
 *
 * In-app only, deliberately. There are exactly two email switches in the account
 * settings — releases and news — and sending a third kind of mail that nobody
 * agreed to is how a notification system loses the right to send anything. The
 * bell is the right channel for "this project is on hold"; it is useful to see
 * and not worth an inbox.
 *
 * Silent for the states nobody needs a message about (a project moving back to
 * `ANNOUNCED`), and for the follower who turned notifications off.
 */
export async function notifyProjectStatusChange(
  projectId: string,
  status: ProjectStatus,
): Promise<{ notified: number }> {
  const message = PROJECT_STATUS_MESSAGE[status];
  if (!message) return { notified: 0 };

  const project = await db.project.findFirst({
    where: { id: projectId, deletedAt: null, publishStatus: 'PUBLISHED' },
    select: { id: true, slug: true, title: true, coverImageUrl: true },
  });
  if (!project) return { notified: 0 };

  const followers = await db.favorite.findMany({
    where: { projectId, notify: true, user: { deletedAt: null, status: 'ACTIVE' } },
    select: { userId: true },
  });
  if (followers.length === 0) return { notified: 0 };

  const notified = await notifyMany(
    followers.map(({ userId }) => ({
      userId,
      type: 'PROJECT_UPDATE' as const,
      title: project.title,
      body: message,
      href: `/projektek/${project.slug}`,
      imageUrl: project.coverImageUrl ?? undefined,
      meta: { projectId: project.id, status },
    })),
  );

  return { notified };
}

/**
 * An account-level message from the team to one person.
 *
 * The `SYSTEM` type exists for the things that happen *to* an account rather
 * than to content — a role granted, an account suspended. Those are decisions a
 * person should hear about from us rather than discover by finding a button
 * missing.
 */
export async function notifySystem(
  userId: string,
  title: string,
  body: string,
  href?: string,
): Promise<void> {
  await notify({ userId, type: 'SYSTEM', title, body, href });
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
