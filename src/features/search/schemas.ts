import { z } from 'zod';

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1, 'Adj meg keresőkifejezést.').max(120),
  limit: z.coerce.number().int().min(1).max(20).default(8),
  type: z.enum(['all', 'project', 'episode', 'news', 'team']).default('all'),
});
