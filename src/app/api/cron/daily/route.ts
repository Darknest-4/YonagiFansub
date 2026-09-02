import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { logger } from '@/infrastructure/logger';
import { runDailyMaintenance } from '@/features/maintenance/daily-job';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Nightly maintenance trigger.
 *
 * The route does two things and no more: it proves the caller is the cron
 * daemon, and it starts the job. What the job actually does — and in which
 * order, and why — lives in `features/maintenance/daily-job.ts`.
 *
 * Authentication is a shared secret in a header rather than a session, because
 * the caller is a cron daemon, not a person. Without `CRON_SECRET` configured
 * the endpoint refuses to run at all — an unauthenticated maintenance endpoint
 * is a denial-of-service primitive.
 */
function authorised(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || expected.length < 16) return false;

  // Vercel Cron signs its own requests; accept either.
  const provided =
    request.headers.get('x-cron-secret') ??
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    '';

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!authorised(request)) {
    logger.warn('Unauthorised cron attempt');
    return NextResponse.json({ error: { code: 'FORBIDDEN' } }, { status: 403 });
  }

  const report = await runDailyMaintenance();

  return NextResponse.json({ data: report }, { headers: { 'Cache-Control': 'no-store' } });
}
