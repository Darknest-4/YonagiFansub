import { defineRoute, idParams } from '@/shared/api/handler';
import { checkProvider } from '@/features/video/health-service';
import { mutationContext } from '@/shared/api/mutation-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Egy szolgáltató ellenőrzése a forrásain keresztül.
 *
 * A beágyazó szolgáltatóknak nincs „állapot" végpontjuk, tehát mintavételezünk:
 * néhány forrásukat kopogtatjuk meg, és abból következtetünk. Lásd a
 * `health-service.ts`-t arról, miért elég egyetlen működő forrás ahhoz, hogy a
 * szolgáltatót élőnek mondjuk.
 */
export const POST = defineRoute({
  auth: 'episode:write',
  rateLimit: 'admin:write',
  params: idParams,
  async handler({ params, user, ipHash, userAgent, requestId }) {
    const outcome = await checkProvider(params.id);

    await mutationContext(user!, { ipHash, userAgent, requestId }).audit({
      action: 'UPDATE',
      entityType: 'VideoProvider',
      entityId: params.id,
      summary: `Szolgáltató ellenőrizve: ${outcome.previous} → ${outcome.current} (${outcome.detail})`,
    });

    return outcome;
  },
});
