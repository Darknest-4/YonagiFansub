import { defineRoute } from '@/lib/api/handler';
import { verifyEmailSchema } from '@/lib/validation/schemas';
import { verifyEmail } from '@/server/auth-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  auth: 'public',
  rateLimit: 'auth:verify',
  body: verifyEmailSchema,
  async handler({ body }) {
    await verifyEmail(body.token);
    return { verified: true };
  },
});
