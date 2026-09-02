import { defineRoute } from '@/shared/api/handler';
import { settingsWriteSchema } from '@/features/settings/schemas';
import { CACHE_TAGS, invalidate } from '@/infrastructure/cache';
import { SETTING_DEFINITIONS } from '@/features/settings/definitions';
import { getSettings, writeSettings } from '@/features/settings/service';
import { recordAudit } from '@/shared/api/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  auth: 'settings:read',
  rateLimit: 'api:read',
  async handler() {
    return { values: await getSettings(), definitions: SETTING_DEFINITIONS };
  },
});

export const PUT = defineRoute({
  auth: 'settings:write',
  rateLimit: 'admin:write',
  body: settingsWriteSchema,
  async handler({ body, user, ipHash, userAgent, requestId }) {
    const before = await getSettings();
    const result = await writeSettings(body.values, user!.id);

    // Settings are read on every server render, so the cache must drop
    // immediately — a stale maintenance-mode flag is a visible outage.
    invalidate(CACHE_TAGS.settings);

    await recordAudit({
      actorId: user!.id,
      actorLabel: `${user!.displayName} (@${user!.username})`,
      action: 'SETTINGS_CHANGE',
      entityType: 'SiteSetting',
      summary: `Beállítások módosítva: ${result.updated.join(', ') || '—'}`,
      before: Object.fromEntries(result.updated.map((key) => [key, before[key as keyof typeof before]])),
      after: Object.fromEntries(result.updated.map((key) => [key, body.values[key]])),
      ipHash,
      userAgent,
      requestId,
    });

    return { ...result, values: await getSettings() };
  },
});
