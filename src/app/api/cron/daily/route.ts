import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { logger } from '@/lib/logger';
import { pruneAuditLogs } from '@/lib/api/audit';
import { pruneExpiredSessions } from '@/lib/auth/session';
import { pruneNotifications } from '@/server/notifications';
import { publishDueReleases } from '@/server/releases';
import { publishDueNews } from '@/server/news';
import { db } from '@/lib/db';
import { CACHE_TAGS, invalidate } from '@/lib/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Nightly maintenance.
 *
 * Every task here is idempotent and independently recoverable: a missed run
 * costs a day of latency, never correctness. That is why they are a swept batch
 * rather than per-row timers — timers do not survive a restart, and a fansub
 * server restarts.
 *
 * Authentication is a shared secret in a header rather than a session, because
 * the caller is a cron daemon, not a person. Without `CRON_SECRET` configured
 * the endpoint refuses to run at all — an unauthenticated maintenance endpoint
 * is a denial-of-service primitive.
 */

function authorised(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || expected.length < 16) return false;

  // Vercel Cron signs its own requests; accept either.
  const provided =
    request.headers.get('x-cron-secret') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    '';

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!authorised(request)) {
    logger.warn('Unauthorised cron attempt');
    return NextResponse.json({ error: { code: 'FORBIDDEN' } }, { status: 403 });
  }

  const startedAt = performance.now();
  const results: Record<string, number | string> = {};

  /** One failing task must not abort the rest of the run. */
  async function step(name: string, task: () => Promise<number>) {
    try {
      results[name] = await task();
    } catch (error) {
      logger.error(`Cron step failed: ${name}`, error);
      results[name] = 'failed';
    }
  }

  await step('publishedReleases', publishDueReleases);
  await step('publishedNews', publishDueNews);
  await step('prunedSessions', pruneExpiredSessions);
  await step('prunedNotifications', () => pruneNotifications(90));
  await step('prunedAuditLogs', () => pruneAuditLogs(365));

  await step('prunedDownloadEvents', async () => {
    // Retention promised in the privacy policy: 12 months.
    const cutoff = new Date(Date.now() - 365 * 86_400_000);
    const { count } = await db.downloadEvent.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return count;
  });

  await step('prunedContactMessages', async () => {
    const cutoff = new Date(Date.now() - 730 * 86_400_000);
    const { count } = await db.contactMessage.deleteMany({
      where: { createdAt: { lt: cutoff }, status: { in: ['ARCHIVED', 'SPAM'] } },
    });
    return count;
  });

  await step('prunedExpiredTokens', async () => {
    const now = new Date();
    const [reset, verify] = await Promise.all([
      db.passwordResetToken.deleteMany({ where: { expiresAt: { lt: now } } }),
      db.emailVerificationToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    ]);
    return reset.count + verify.count;
  });

  // Anything published above is now visible; drop the cached feeds.
  if (results.publishedReleases || results.publishedNews) {
    invalidate(CACHE_TAGS.releases, CACHE_TAGS.news, CACHE_TAGS.projects, CACHE_TAGS.stats);
  }

  const durationMs = Math.round(performance.now() - startedAt);
  logger.info('Daily maintenance completed', { durationMs, ...results });

  return NextResponse.json(
    { data: { ...results, durationMs } },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
