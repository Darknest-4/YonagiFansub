import { defineRoute, idParams } from '@/shared/api/handler';
import { playbackQuerySchema } from '@/features/video/schemas';
import { assertPlaybackEnabled, buildPlaybackManifest } from '@/features/video/playback-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A lejátszási terv egy epizódhoz.
 *
 * Ez az egyetlen belépő a lejátszáshoz, és szándékosan **nem** ad vissza
 * forrás-URL-t. Amit ad: a visszaesési lánc forrásazonosítókkal, a felajánlható
 * minőségek, a főcím-időzítések, a feliratsávok és a szomszédos részek. A
 * tényleges címek a `/api/v1/watch/…` végpontokon állnak elő, kérésenként újra,
 * rövid életű és nézőhöz kötött tokennel.
 *
 * Hitelesítés nincs kötelezően: egy fansub nyilvános része nyilvános marad. A
 * `requiresAuth` forrásokat viszont a feloldó kiveszi a vendég láncából, tehát
 * a zárt forrás azonosítója sem kerül ki.
 */
export const GET = defineRoute({
  auth: 'public',
  rateLimit: 'api:read',
  params: idParams,
  query: playbackQuerySchema,
  async handler({ params, query, user }) {
    await assertPlaybackEnabled();

    return buildPlaybackManifest({
      episodeId: params.id,
      quality: query.quality,
      userId: user?.id ?? null,
      excludeSourceIds: query.exclude,
    });
  },
});
