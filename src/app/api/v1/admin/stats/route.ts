import { defineRoute } from '@/lib/api/handler';
import { getDashboardStats, getDownloadTrend, getTopReleases } from '@/server/stats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  auth: 'stats:read',
  rateLimit: 'api:read',
  async handler() {
    const [stats, trend, top] = await Promise.all([
      getDashboardStats(),
      getDownloadTrend(30),
      getTopReleases(8),
    ]);
    return { stats, trend, top };
  },
});
