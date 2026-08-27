import { defineRoute } from '@/lib/api/handler';
import { updatePreferencesSchema } from '@/lib/validation/schemas';
import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Notification and display preferences.
 *
 * Stored as a JSON column rather than as a table of columns: these are per-user
 * UI choices with no relational meaning, they change shape as the product grows,
 * and nothing ever queries or aggregates across them.
 */
export const PATCH = defineRoute({
  auth: 'user',
  rateLimit: 'api:write',
  body: updatePreferencesSchema,
  async handler({ body, user }) {
    const merged = {
      ...(user!.preferences ?? {}),
      ...body,
    } as Prisma.InputJsonValue;

    await db.user.update({
      where: { id: user!.id },
      data: { preferences: merged },
    });

    return { preferences: merged };
  },
});
