import { defineRoute } from '@/lib/api/handler';
import { registerSchema } from '@/lib/validation/schemas';
import { registerUser } from '@/server/auth-service';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  auth: 'public',
  rateLimit: 'auth:register',
  body: registerSchema,
  async handler({ body, ip, ipHash, userAgent, requestId }) {
    // Honeypot: a filled hidden field means a bot. Respond as if it worked —
    // telling a scraper it was detected only teaches it to try harder.
    if (body.website) {
      logger.warn('Honeypot triggered on registration', { requestId });
      return { registered: true, verificationRequired: true, isOwner: false };
    }

    const result = await registerUser({
      email: body.email,
      username: body.username,
      displayName: body.displayName,
      password: body.password,
      ip,
      ipHash,
      userAgent,
      requestId,
    });

    /*
     * Az első fiók tulajdonos lesz, azonnal aktív és megerősített — nincs mire
     * várnia. A felület ezt közli vele, különben egy soha meg nem érkező
     * levélre várna azzal a fiókkal, ami nélkül a rendszert nem lehet beállítani.
     */
    return {
      registered: true,
      verificationRequired: !result.isBootstrap,
      isOwner: result.isBootstrap,
    };
  },
});
