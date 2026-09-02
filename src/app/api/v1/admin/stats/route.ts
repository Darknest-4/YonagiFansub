import { defineRoute } from '@/shared/api/handler';
import { getDashboardStats, getTopEpisodes, getWatchTrend } from '@/features/stats/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  auth: 'stats:read',
  rateLimit: 'api:read',
  async handler() {
    const [stats, trend, top] = await Promise.all([
      getDashboardStats(),
      getWatchTrend(30),
      getTopEpisodes(8),
    ]);
    return { stats, trend, top };
  },
});
