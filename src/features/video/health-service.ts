import 'server-only';
import { db } from '@/infrastructure/db';
import { logger } from '@/infrastructure/logger';
import { NotFoundError } from '@/shared/lib/errors';
import { resolveAdapter, SLOW_RESPONSE_MS } from '@/features/video/adapters';
import type { AvailabilityResult } from '@/features/video/adapters/contract';
import { classifyHealth, type HealthInput, type HealthVerdict } from '@/features/video/health-rules';

/**
 * A források és szolgáltatók állapotának karbantartása.
 *
 * A **döntés** — hogy egy eredményből milyen állapot lesz — a `health-rules.ts`
 * tiszta függvényében van, mert ott van a lényeg és ott laknak a hibák. Ez a
 * fájl a körítés: lekérdez, meghívja az adaptert, elmenti az eredményt.
 */

export interface CheckOutcome {
  targetId: string;
  previous: string;
  current: string;
  detail: string;
  latencyMs: number | null;
}

/** Az adapternek átadott alak — a lekérdezés eredményéből. */
function toAdapterSource(row: {
  id: string;
  kind: string;
  masterKey: string | null;
  externalId: string | null;
  sourceUrl: string | null;
  provider: { slug: string; name: string; embedTemplate: string | null; domains: string[] } | null;
}) {
  return {
    id: row.id,
    kind: row.kind,
    masterKey: row.masterKey,
    externalId: row.externalId,
    sourceUrl: row.sourceUrl,
    provider: row.provider,
  };
}

/**
 * Az eredmény elmentése, a korábbi állapotra építve.
 *
 * A hibaszámláló és a gördülő átlag miatt nem elég az új eredményt beírni: az
 * állapot **az előzményből és az új mérésből** együtt áll össze. Ezért olvasunk
 * előbb, és ezért `upsert` — egy forrásnak nem feltétlenül van még sora.
 */
async function persist(
  target: { sourceId: string } | { providerId: string },
  result: AvailabilityResult,
): Promise<CheckOutcome> {
  const where =
    'sourceId' in target ? { sourceId: target.sourceId } : { providerId: target.providerId };
  const targetId = 'sourceId' in target ? target.sourceId : target.providerId;

  const existing = await db.videoSourceHealth.findUnique({
    where: where as never,
    select: {
      status: true,
      failureCount: true,
      averageLatencyMs: true,
      isMaintenance: true,
      lastSuccessAt: true,
    },
  });

  const input: HealthInput = {
    result,
    previousStatus: (existing?.status ?? 'UNKNOWN') as HealthInput['previousStatus'],
    previousFailureCount: existing?.failureCount ?? 0,
    previousAverageLatencyMs: existing?.averageLatencyMs ?? null,
    isMaintenance: existing?.isMaintenance ?? false,
    slowThresholdMs: SLOW_RESPONSE_MS,
  };

  const verdict: HealthVerdict = classifyHealth(input);
  const now = new Date();

  const data = {
    status: verdict.status,
    failureCount: verdict.failureCount,
    averageLatencyMs: verdict.averageLatencyMs,
    lastError: verdict.status === 'ONLINE' ? null : result.detail.slice(0, 300),
    lastCheckedAt: now,
    ...(verdict.wasSuccess ? { lastSuccessAt: now } : { lastFailureAt: now }),
  };

  await db.videoSourceHealth.upsert({
    where: where as never,
    create: { ...target, ...data },
    update: data,
  });

  return {
    targetId,
    previous: existing?.status ?? 'UNKNOWN',
    current: verdict.status,
    detail: result.detail,
    latencyMs: result.latencyMs,
  };
}

/** Egyetlen forrás ellenőrzése. Az admin „Forrás tesztelése" gombja ezt hívja. */
export async function checkSource(sourceId: string): Promise<CheckOutcome> {
  const source = await db.videoSource.findFirst({
    where: { id: sourceId, deletedAt: null },
    select: {
      id: true,
      kind: true,
      masterKey: true,
      externalId: true,
      sourceUrl: true,
      provider: { select: { slug: true, name: true, embedTemplate: true, domains: true } },
    },
  });

  if (!source) throw new NotFoundError('A videóforrás');

  const adapter = resolveAdapter(source.kind);
  if (!adapter) {
    return persist(
      { sourceId },
      { state: 'UNKNOWN', detail: `Nincs adapter ehhez a fajtához: ${source.kind}`, latencyMs: null },
    );
  }

  const result = await adapter.checkAvailability(toAdapterSource(source));

  logger.info('Video source checked', {
    sourceId,
    kind: source.kind,
    state: result.state,
    latencyMs: result.latencyMs,
  });

  return persist({ sourceId }, result);
}

/**
 * Egy szolgáltató ellenőrzése a forrásain keresztül.
 *
 * A beágyazó szolgáltatóknak nincs olyan végpontja, amit „a szolgáltató
 * állapotaként" meg lehetne kérdezni — a lejátszójuk egy-egy videóhoz tartozik.
 * Ezért a szolgáltató állapota a **mintavételből** áll össze: néhány saját
 * forrását ellenőrizzük, és abból következtetünk. Ha mind elesik, a szolgáltató
 * esett el; ha csak egy, akkor az az egy fájl.
 */
export async function checkProvider(providerId: string, sampleSize = 3): Promise<CheckOutcome> {
  const provider = await db.videoProvider.findUnique({
    where: { id: providerId },
    select: {
      id: true,
      slug: true,
      name: true,
      kind: true,
      embedTemplate: true,
      domains: true,
      sources: {
        where: { deletedAt: null, status: 'PUBLISHED' },
        take: sampleSize,
        orderBy: { updatedAt: 'desc' },
        select: { id: true, kind: true, masterKey: true, externalId: true, sourceUrl: true },
      },
    },
  });

  if (!provider) throw new NotFoundError('A szolgáltató');

  if (provider.sources.length === 0) {
    /*
      Nincs mit mintavételezni.

      Ilyenkor `UNKNOWN` a helyes válasz, nem `ONLINE` és nem `OFFLINE`: egy
      frissen felvett szolgáltatóról, aminek még nincs forrása, semmit nem
      tudunk — és mindkét másik válasz azt állítaná, hogy tudunk.
    */
    return persist(
      { providerId },
      { state: 'UNKNOWN', detail: 'Nincs publikált forrás a mintavételhez.', latencyMs: null },
    );
  }

  const shape = {
    slug: provider.slug,
    name: provider.name,
    embedTemplate: provider.embedTemplate,
    domains: provider.domains,
  };

  const results = await Promise.all(
    provider.sources.map(async (source) => {
      const adapter = resolveAdapter(source.kind);
      if (!adapter) return { state: 'UNKNOWN' as const, detail: 'Nincs adapter.', latencyMs: null };
      return adapter.checkAvailability(toAdapterSource({ ...source, provider: shape }));
    }),
  );

  const available = results.filter((entry) => entry.state === 'AVAILABLE').length;
  const latencies = results
    .map((entry) => entry.latencyMs)
    .filter((value): value is number => value !== null);
  const latencyMs = latencies.length
    ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
    : null;

  /*
    Egyetlen működő forrás elég ahhoz, hogy a szolgáltatót élőnek mondjuk.

    A fordítottja — „mind működjön" — azt jelentené, hogy egyetlen törölt fájl
    az egész szolgáltatót halottnak minősíti, és vele minden más forrását
    kiveszi a láncból. Az a hiba drágább, mint amit megelőzne.
  */
  const result: AvailabilityResult =
    available > 0
      ? {
          state: 'AVAILABLE',
          detail: `${available}/${results.length} mintavett forrás elérhető.`,
          latencyMs,
        }
      : {
          state: 'UNAVAILABLE',
          detail: `Egyik mintavett forrás sem érhető el (${results.length} db).`,
          latencyMs,
        };

  logger.info('Video provider checked', {
    providerId,
    sampled: results.length,
    available,
    latencyMs,
  });

  return persist({ providerId }, result);
}

/**
 * Kézi karbantartási jelölés.
 *
 * Külön az automatikától: amit ember tesz karbantartásba, azt csak ember veszi
 * ki. Enélkül a következő éjszakai ellenőrzés visszakapcsolná azt, amit valaki
 * szándékosan kivett.
 */
export async function setMaintenance(
  target: { sourceId: string } | { providerId: string },
  isMaintenance: boolean,
): Promise<void> {
  const where =
    'sourceId' in target ? { sourceId: target.sourceId } : { providerId: target.providerId };

  await db.videoSourceHealth.upsert({
    where: where as never,
    create: {
      ...target,
      isMaintenance,
      status: isMaintenance ? 'MAINTENANCE' : 'UNKNOWN',
    },
    update: {
      isMaintenance,
      // Karbantartásból kilépve nem találgatunk: a következő ellenőrzés mondja meg.
      status: isMaintenance ? 'MAINTENANCE' : 'UNKNOWN',
    },
  });
}

/**
 * A napi körellenőrzés.
 *
 * Kötegelve és korlátozottan: egy éjszakai feladat nem terhelheti meg a
 * szolgáltatókat, és nem futhat órákig. A legrégebben ellenőrzöttek jönnek
 * előbb, tehát néhány éjszaka alatt minden sorra kerül anélkül, hogy bármelyik
 * körben mindent végigkérdeznénk.
 */
export async function runScheduledHealthChecks(limit = 25): Promise<number> {
  const sources = await db.videoSource.findMany({
    where: { deletedAt: null, status: 'PUBLISHED', health: { isMaintenance: false } },
    take: limit,
    orderBy: [{ health: { lastCheckedAt: { sort: 'asc', nulls: 'first' } } }],
    select: { id: true },
  });

  let checked = 0;
  for (const source of sources) {
    try {
      await checkSource(source.id);
      checked += 1;
    } catch (error) {
      logger.warn('Scheduled source check failed', { sourceId: source.id, error: String(error) });
    }
  }

  const providers = await db.videoProvider.findMany({
    where: { isEnabled: true },
    select: { id: true },
  });

  for (const provider of providers) {
    try {
      await checkProvider(provider.id);
      checked += 1;
    } catch (error) {
      logger.warn('Scheduled provider check failed', {
        providerId: provider.id,
        error: String(error),
      });
    }
  }

  return checked;
}
