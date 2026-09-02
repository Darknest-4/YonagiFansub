import { defineRoute } from '@/shared/api/handler';
import { forgotPasswordSchema } from '@/features/auth/schemas';
import { requestPasswordReset } from '@/features/auth/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  auth: 'public',
  rateLimit: 'auth:password-forgot',
  body: forgotPasswordSchema,
  async handler({ body }) {
    if (!body.website) {
      await requestPasswordReset(body.email);
    }

    // Always the same response. Whether the address exists is not information
    // this endpoint is willing to give away.
    return {
      sent: true,
      message:
        'Ha tartozik fiók ehhez az e-mail-címhez, elküldtük rá a jelszó-visszaállító linket.',
    };
  },
});
