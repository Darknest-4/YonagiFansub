import 'server-only';
import { db } from '@/infrastructure/db';
import { logger } from '@/infrastructure/logger';
import { sendMail } from '@/infrastructure/mail/transport';
import { notificationMail } from '@/features/notifications/mail';
import { getSettings } from '@/features/settings/service';
import { mailSiteUrl } from '@/shared/lib/site-url';

/**
 * The email digest.
 *
 * The account settings have offered a daily or weekly summary since the site
 * went up, and nothing was behind it: no job, no query, no mail. The setting
 * saved fine and then did nothing, forever, without a single line in a log to
 * say so. That is the worst shape a bug can take — the interface promises
 * something, and the only way to find out it never happened is to notice the
 * absence of mail you were never told wasn't coming.
 *
 * ## What it sends
 *
 * The digest is not a second notification channel. It is a *replacement* for
 * watching the bell: the same in-app notifications, gathered up and posted once.
 * So it reads the `Notification` table rather than re-deriving events from
 * releases and posts, and it sends nothing when there is nothing — an email that
 * says "no news this week" is the fastest route to an unsubscribe.
 *
 * ## Why it is time-based rather than a queue
 *
 * `digestSentAt` on the user row is the whole scheduler. Due-ness is "last sent
 * longer ago than the period", which makes the job idempotent by construction: a
 * missed night delays a digest instead of skipping it, and a second run on the
 * same day finds nothing due. Nothing to drain, nothing to lose on a restart.
 *
 * The windows are deliberately shorter than the period they describe (20 hours
 * for daily, 6½ days for weekly). A nightly run never starts at exactly the same
 * second, and a strict 24-hour test would push the send to the *next* night
 * every time the job started a minute early — a daily digest that arrives every
 * other day.
 */

/** Users considered per run. Well above any plausible fansub membership. */
const BATCH_SIZE = 500;

/** How much of the notification list one email will carry. */
const MAX_ITEMS = 15;

const PERIODS = {
  daily: { dueAfterMs: 20 * 3_600_000, windowMs: 26 * 3_600_000 },
  weekly: { dueAfterMs: 6.5 * 86_400_000, windowMs: 8 * 86_400_000 },
} as const;

export type DigestPeriod = keyof typeof PERIODS;

/**
 * Reads the digest preference out of the user's JSON blob.
 *
 * Exported for the tests: `preferences` is an untyped column, so "off",
 * missing, and outright garbage all have to mean the same thing — do not send.
 * An unrecognised value must never fall through to sending mail.
 */
export function digestPeriod(preferences: unknown): DigestPeriod | null {
  if (typeof preferences !== 'object' || preferences === null) return null;
  const value = (preferences as { emailDigest?: unknown }).emailDigest;
  return value === 'daily' || value === 'weekly' ? value : null;
}

/**
 * Is a digest due?
 *
 * A user who never received one is always due. Otherwise the gap is compared
 * against a threshold slightly *under* the nominal period — see the note at the
 * top of the file for why a strict 24 hours turns a daily digest into an
 * every-other-day one.
 */
export function isDigestDue(
  period: DigestPeriod,
  lastSentAt: Date | null,
  now: Date,
): boolean {
  if (!lastSentAt) return true;
  return now.getTime() - lastSentAt.getTime() >= PERIODS[period].dueAfterMs;
}

/** Oldest notification a digest may reach back to, given when the last one went. */
export function digestWindowStart(
  period: DigestPeriod,
  lastSentAt: Date | null,
  now: Date,
): Date {
  return new Date(Math.max(lastSentAt?.getTime() ?? 0, now.getTime() - PERIODS[period].windowMs));
}

export interface DigestOutcome {
  /** Digest emails actually sent. */
  sent: number;
  /** Users who were due but had nothing to report. */
  skippedEmpty: number;
  /** The `digestEnabled` setting is off, so nothing was even considered. */
  disabled?: boolean;
}

export async function sendDigests(now = new Date()): Promise<DigestOutcome> {
  /*
    The kill switch is checked here rather than in the cron route, so that every
    caller is covered by it — including whatever calls this next year.

    Nothing is written when it is off. In particular `digestSentAt` is left
    alone: stamping it would silently swallow the window the digest covers, so
    turning the setting back on a week later would send everyone a digest of the
    last day and quietly drop the six before it. Leaving the column untouched
    means the first run after the switch flips picks up where it left off, and
    the per-period cap in `digestWindowStart` keeps that from becoming a year of
    backlog in one email.
  */
  const settings = await getSettings();
  if (!settings.digestEnabled) return { sent: 0, skippedEmpty: 0, disabled: true };

  /*
    Postgres cannot filter on a JSON field through Prisma's typed API here
    without a raw fragment, and the number of candidates is small either way:
    only verified, active accounts can have a digest preference at all. The
    period check happens in application code, on a bounded page.
  */
  const candidates = await db.user.findMany({
    where: {
      deletedAt: null,
      status: 'ACTIVE',
      emailVerifiedAt: { not: null },
    },
    select: {
      id: true,
      email: true,
      displayName: true,
      preferences: true,
      digestSentAt: true,
    },
    orderBy: { digestSentAt: { sort: 'asc', nulls: 'first' } },
    take: BATCH_SIZE,
  });

  const outcome: DigestOutcome = { sent: 0, skippedEmpty: 0 };

  for (const user of candidates) {
    const period = digestPeriod(user.preferences);
    if (!period) continue;
    if (!isDigestDue(period, user.digestSentAt, now)) continue;

    /*
      The window is capped even for a first-time digest. Without the cap, a user
      who turns the setting on after a year of membership would get their whole
      notification history in one email.
    */
    const from = digestWindowStart(period, user.digestSentAt, now);

    const items = await db.notification.findMany({
      where: { userId: user.id, createdAt: { gt: from } },
      orderBy: { createdAt: 'desc' },
      take: MAX_ITEMS,
      select: { title: true, body: true },
    });

    if (items.length === 0) {
      /*
        Still stamp the row. Without this, a quiet account is re-examined on
        every run forever, and — worse — the moment something finally happens it
        would be reported against a window stretching back to the day the
        setting was switched on.
      */
      await db.user.update({ where: { id: user.id }, data: { digestSentAt: now } });
      outcome.skippedEmpty += 1;
      continue;
    }

    await sendMail({
      to: user.email,
      ...notificationMail.digest(user.displayName, period, items, `${mailSiteUrl()}/profil/ertesitesek`),
    });

    await db.user.update({ where: { id: user.id }, data: { digestSentAt: now } });
    outcome.sent += 1;
  }

  if (outcome.sent > 0 || outcome.skippedEmpty > 0) {
    logger.info('Digest run completed', { ...outcome });
  }

  return outcome;
}
