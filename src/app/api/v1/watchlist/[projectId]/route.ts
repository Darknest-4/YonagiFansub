import { z } from 'zod';
import { defineRoute } from '@/shared/api/handler';
import { setWatchlistMark } from '@/features/watch/watchlist-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const params = z.object({ projectId: z.string().cuid() });

/**
 * A néző kézi jelölése egy projekten.
 *
 * Csak azt a kettőt fogadja el, ami nem számolható ki: a „tervezett"-et és az
 * „elhagyott"-at. A „nézem" és a „befejezett" a nézési előrehaladásból
 * következik, és ha itt is be lehetne állítani, két igazságforrás lenne
 * ugyanarra — a séma szintjén zárjuk ki, nem szabályban.
 *
 * A `null` a jelölés visszavonása. Ettől a projekt nem tűnik el a listáról, ha
 * van rajta előrehaladás: onnantól „nézem"-ként látszik, mert az az igaz.
 *
 * A válasz mindig a *kiszámolt* állapotot adja vissza, nem azt, amit kértek —
 * így a felület nem tud eltérni attól, amit a lista mutatni fog. Aki egy már
 * elkezdett sorozatot jelöl tervezettnek, azonnal látja, hogy „nézem" lett
 * belőle, magyarázat nélkül is érthetően.
 */
export const PUT = defineRoute({
  auth: 'user',
  rateLimit: 'api:write',
  params,
  body: z.object({ kind: z.enum(['PLANNED', 'DROPPED']).nullable() }),
  async handler({ user, params: { projectId }, body }) {
    return setWatchlistMark(user!.id, projectId, body.kind);
  },
});
