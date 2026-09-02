import { defineRoute } from '@/shared/api/handler';
import { listUsableProviders } from '@/features/video/provider-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Enabled providers, for the source form's dropdown.
 *
 * `episode:write` rather than `settings:write`: attaching a source is content
 * work, and the editor doing it needs to see the list without being able to
 * change which external hosts the site trusts.
 */
export const GET = defineRoute({
  auth: 'episode:write',
  rateLimit: 'api:read',
  async handler() {
    return listUsableProviders();
  },
});
