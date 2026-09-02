import { defineRoute } from '@/shared/api/handler';
import { updatePreferencesSchema } from '@/features/users/schemas';
import { updateOwnPreferences } from '@/features/users/account-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Notification and display preferences. */
export const PATCH = defineRoute({
  auth: 'user',
  rateLimit: 'api:write',
  body: updatePreferencesSchema,
  handler: ({ body, user }) => updateOwnPreferences(user!.id, user!.preferences, body),
});
