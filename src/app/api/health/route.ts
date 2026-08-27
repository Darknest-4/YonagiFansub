import { NextResponse } from 'next/server';
import { checkDatabase } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Liveness + readiness probe.
 *
 * Used by the container healthcheck and by the load balancer. Returns 503 when
 * the database is unreachable so an instance that cannot serve requests is
 * taken out of rotation instead of returning errors to users.
 *
 * Deliberately reveals nothing beyond up/down and a latency number.
 */
export async function GET() {
  const database = await checkDatabase();
  const healthy = database.ok;

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: { database: { ok: database.ok, latencyMs: database.latencyMs } },
    },
    {
      status: healthy ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
