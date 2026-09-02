import { defineRoute } from '@/shared/api/handler';
import { resetPasswordSchema } from '@/lib/validation/schemas';
import { resetPassword } from '@/features/auth/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  auth: 'public',
  rateLimit: 'auth:password-reset',
  body: resetPasswordSchema,
  async handler({ body, ipHash, userAgent, requestId }) {
    await resetPassword(body.token, body.password, { ipHash, userAgent, requestId });
    return { reset: true };
  },
});
