import { defineRoute } from '@/shared/api/handler';
import { videoProviderWriteSchema } from '@/lib/validation/schemas';
import { createVideoProvider, listVideoProviders } from '@/features/video/provider-service';
import { mutationContext } from '@/shared/api/mutation-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  auth: 'episode:write',
  rateLimit: 'api:read',
  async handler() {
    return listVideoProviders();
  },
});

export const POST = defineRoute({
  // Settings-level rather than episode-level: a provider decides which external
  // hosts the site will frame, which is a security boundary, not content.
  auth: 'settings:write',
  rateLimit: 'admin:write',
  body: videoProviderWriteSchema,
  async handler({ body, user, ipHash, userAgent, requestId }) {
    return createVideoProvider(body, mutationContext(user!, { ipHash, userAgent, requestId }));
  },
});
