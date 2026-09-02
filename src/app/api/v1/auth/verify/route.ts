import { defineRoute } from '@/shared/api/handler';
import { verifyEmailSchema } from '@/features/auth/schemas';
import { verifyEmail } from '@/features/auth/service';

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
