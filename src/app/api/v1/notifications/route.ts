import { z } from 'zod';
import { defineRoute } from '@/shared/api/handler';
import { countUnread, listNotifications, markRead } from '@/features/notifications/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  auth: 'user',
  rateLimit: 'api:read',
  query: z.object({
    unreadOnly: z.enum(['true', 'false']).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  }),
  async handler({ user, query }) {
    const [items, unread] = await Promise.all([
      listNotifications(user!.id, {
        limit: query.limit,
        unreadOnly: query.unreadOnly === 'true',
      }),
      countUnread(user!.id),
    ]);

    return { items, unread };
  },
});

/** Marks notifications read. Omitting `ids` marks everything read. */
export const PATCH = defineRoute({
  auth: 'user',
  rateLimit: 'api:write',
  body: z.object({ ids: z.array(z.string().cuid()).max(100).optional() }),
  async handler({ user, body }) {
    const count = await markRead(user!.id, body.ids);
    return { marked: count, unread: await countUnread(user!.id) };
  },
});
