import 'server-only';
import { logger } from '@/infrastructure/logger';
import { env } from '@/infrastructure/env';
import { CACHE_TAGS, invalidate } from '@/infrastructure/cache';
import { pruneAuditLogs } from '@/shared/api/audit';
import { pruneExpiredSessions } from '@/shared/auth/session';
import { pruneExpiredAuthTokens, resendMissedVerifications } from '@/features/auth/service';
import { pruneContactMessages } from '@/features/contact/admin-service';
import { pruneNotifications } from '@/features/notifications/service';
import { sendDigests } from '@/features/notifications/digest';
import { publishDueNews } from '@/features/news/queries';
import { runScheduledSync } from '@/features/metadata/sync-service';
import { runScheduledHealthChecks } from '@/features/video/health-service';

/**
 * Az éjszakai karbantartás.
 *
 * Minden lépés idempotens és külön-külön helyrehozható: egy kimaradt futás egy
 * nap késést jelent, sosem hibás állapotot. Ezért söprő köteg és nem soronkénti
 * időzítő — az időzítők nem élik túl az újraindítást, egy fansub szerver pedig
 * újraindul.
 *
 * A lépések a saját feature-jükben laknak; itt csak a **sorrend** van, mert az
 * a döntés, ami sehol máshol nem látszana. Új karbantartó lépés úgy kerül be,
 * hogy a saját feature-e exportál egy `Promise<number>`-t adó függvényt, és az
 * ide kerül egy `step()` hívásba.
 */
export type MaintenanceReport = Record<string, number | string>;

export async function runDailyMaintenance(): Promise<MaintenanceReport & { durationMs: number }> {
  const startedAt = performance.now();
  const results: MaintenanceReport = {};

  /** One failing task must not abort the rest of the run. */
  async function step(name: string, task: () => Promise<number>) {
    try {
      results[name] = await task();
    } catch (error) {
      logger.error(`Cron step failed: ${name}`, error);
      results[name] = 'failed';
    }
  }

  await step('publishedNews', publishDueNews);
  await step('prunedSessions', pruneExpiredSessions);
  await step('prunedNotifications', () => pruneNotifications(90));
  await step('prunedAuditLogs', () => pruneAuditLogs(365));
  await step('prunedContactMessages', () => pruneContactMessages(730));
  await step('prunedExpiredTokens', pruneExpiredAuthTokens);

  /*
    Confirmation links that never arrived.

    Deliberately before the digests, because it is the more urgent of the two:
    an account waiting on a confirmation cannot fully use the site, while a
    missed digest is a day of latency on things the person can already see.
  */
  await step('resentVerifications', resendMissedVerifications);

  /*
    Digests.

    After the publishing steps above, so an episode that goes live tonight is in
    tonight's digest rather than tomorrow's. `sendDigests` decides for itself who
    is due — a missed run delays a summary, it does not skip one.
  */
  await step('sentDigests', async () => (await sendDigests()).sent);

  /*
    Videóforrások állapota.

    A metaadat-szinkron elé kerül, mert ez a fontosabb: egy elavult évadcím
    kellemetlen, egy halott videóforrás viszont azt jelenti, hogy a néző nem
    tudja megnézni a részt. Kötegelve, a legrégebben ellenőrzöttekkel kezdve —
    így néhány éjszaka alatt minden sorra kerül anélkül, hogy bármelyik körben
    az összes szolgáltatót végigkérdeznénk.
  */
  await step('checkedVideoSources', () => runScheduledHealthChecks(25));

  /*
    Metadata resync, last in the run and batched.

    Last because it is the only step that depends on third-party APIs: if
    AniList is down, the pruning above has already happened. Batched because a
    nightly job must spend a predictable slice of the upstream rate limit —
    `runScheduledSync` takes the stalest projects, so the whole catalogue is
    still covered over a few nights without ever hammering anyone.
  */
  await step('syncedMetadata', async () => {
    const outcome = await runScheduledSync(env.METADATA_SYNC_BATCH);
    if (outcome.failed.length > 0) {
      logger.warn('Metadata sync had failures', { failed: outcome.failed });
    }
    if (outcome.succeeded > 0) invalidate(CACHE_TAGS.projects);
    return outcome.succeeded;
  });

  // Anything published above is now visible; drop the cached feeds.
  if (results.publishedNews) {
    invalidate(CACHE_TAGS.news, CACHE_TAGS.projects, CACHE_TAGS.stats);
  }

  const durationMs = Math.round(performance.now() - startedAt);
  logger.info('Daily maintenance completed', { durationMs, ...results });

  return { ...results, durationMs };
}
