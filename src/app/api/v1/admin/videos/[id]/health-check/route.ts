import { defineRoute, idParams } from '@/shared/api/handler';
import { checkSource } from '@/features/video/health-service';
import { mutationContext } from '@/shared/api/mutation-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Egy forrás azonnali ellenőrzése — az admin „Forrás tesztelése" gombja.
 *
 * Írási jogosultsághoz kötött, pedig csak olvas: kimenő kérést indít a mi
 * nevünkben egy külső címre. Aki ezt kiválthatja, az a szerverünkkel kopogtat
 * valahol, tehát ez nem olvasási művelet, hanem cselekvés — és naplózni is kell.
 */
export const POST = defineRoute({
  auth: 'episode:write',
  rateLimit: 'admin:write',
  params: idParams,
  async handler({ params, user, ipHash, userAgent, requestId }) {
    const outcome = await checkSource(params.id);

    await mutationContext(user!, { ipHash, userAgent, requestId }).audit({
      action: 'UPDATE',
      entityType: 'VideoSource',
      entityId: params.id,
      summary: `Forrás ellenőrizve: ${outcome.previous} → ${outcome.current} (${outcome.detail})`,
    });

    return outcome;
  },
});
