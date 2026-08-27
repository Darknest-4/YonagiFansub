import { NextResponse } from 'next/server';
import { defineRoute, idParams } from '@/lib/api/handler';
import { resolveDownload } from '@/server/releases';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Download resolution.
 *
 * `GET` performs a 302 to the real target (so a plain `<a>` works, and so does
 * a download manager), while `POST` returns the URL as JSON for the in-page
 * flow that wants to show a "starting…" state.
 *
 * Both go through the same service, which records the event and bumps the
 * counters. Keeping the real URL out of the HTML means a dead mirror can be
 * swapped without anyone holding a stale link, and it gives us honest
 * per-release download numbers.
 */

export const GET = defineRoute({
  auth: 'optional',
  rateLimit: 'download:resolve',
  params: idParams,
  csrf: false,
  async handler({ params, user, ipHash, userAgent }) {
    const { url } = await resolveDownload(params.id, {
      userId: user?.id ?? null,
      ipHash,
      userAgent,
    });

    return NextResponse.redirect(url, {
      status: 302,
      headers: {
        'Cache-Control': 'no-store',
        // The target is a third-party host; do not leak our URL to it.
        'Referrer-Policy': 'no-referrer',
      },
    });
  },
});

export const POST = defineRoute({
  auth: 'optional',
  rateLimit: 'download:resolve',
  params: idParams,
  async handler({ params, user, ipHash, userAgent }) {
    const { url, releaseId } = await resolveDownload(params.id, {
      userId: user?.id ?? null,
      ipHash,
      userAgent,
    });

    return { url, releaseId };
  },
});
