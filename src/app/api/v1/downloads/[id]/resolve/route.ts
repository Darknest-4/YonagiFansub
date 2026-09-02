import { NextResponse } from 'next/server';
import { defineRoute, idParams } from '@/lib/api/handler';
import { resolveDownload } from '@/server/releases';
import { assertFeatureEnabled } from '@/server/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/*
  Both verbs are gated, not just the one the UI calls.

  GET is the redirect a user's browser follows and POST is what the download
  panel asks for; a mirror link that keeps resolving through the other verb
  while downloads are "off" would make the setting decorative. The message is
  the same either way — the reason is the same.
*/
const DOWNLOADS_OFF = 'A letöltések jelenleg nem érhetők el.';

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
    await assertFeatureEnabled('downloadsEnabled', DOWNLOADS_OFF);

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
    await assertFeatureEnabled('downloadsEnabled', DOWNLOADS_OFF);

    const { url, releaseId } = await resolveDownload(params.id, {
      userId: user?.id ?? null,
      ipHash,
      userAgent,
    });

    return { url, releaseId };
  },
});
