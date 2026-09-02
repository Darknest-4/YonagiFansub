import { defineRoute } from '@/shared/api/handler';
import { resendVerificationSchema } from '@/lib/validation/schemas';
import { resendVerificationEmail } from '@/features/auth/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Re-sends the address-confirmation link.
 *
 * Public rather than authenticated, because the people who need it most are the
 * ones who cannot get past the confirmation step — and asking them to sign in
 * first to fix not being able to finish signing up is a loop.
 *
 * The response never varies. Whether an account exists, whether it is already
 * confirmed, whether the honeypot caught a bot: all of them return the same
 * sentence, so nothing here can be used to find out who has an account.
 */
export const POST = defineRoute({
  auth: 'public',
  rateLimit: 'auth:verify-resend',
  body: resendVerificationSchema,
  async handler({ body }) {
    if (!body.website) {
      await resendVerificationEmail(body.email);
    }

    return {
      sent: true,
      message:
        'Ha tartozik megerősítetlen fiók ehhez a címhez, újraküldtük rá a megerősítő linket. Nézd meg a spam mappát is.',
    };
  },
});
