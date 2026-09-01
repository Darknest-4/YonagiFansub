import { NextResponse } from 'next/server';
import { defineRoute } from '@/lib/api/handler';
import { exportAccount } from '@/server/account-data';
import { recordAudit } from '@/lib/api/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * "Adataim letöltése" — the portability half of what the privacy policy
 * promises.
 *
 * Returns a file rather than an API envelope. Every other endpoint here wraps
 * its payload in `{ data }` because a client is going to read fields out of it;
 * this one exists to be saved to disk and opened by a person or fed to another
 * service, and an envelope would be a wrapper they have to strip.
 */
export const GET = defineRoute({
  auth: 'user',
  rateLimit: 'account:export',
  async handler({ user, ipHash, userAgent, requestId }) {
    const payload = await exportAccount(user!.id);

    // Worth recording: an export is the moment every piece of an account's data
    // leaves the system in one file, and knowing when that happened matters if
    // the account is later compromised.
    await recordAudit({
      actorId: user!.id,
      action: 'EXPORT',
      entityType: 'User',
      entityId: user!.id,
      summary: 'Adatexport letöltve',
      ipHash,
      userAgent,
      requestId,
    });

    const date = new Date().toISOString().slice(0, 10);

    return NextResponse.json(payload, {
      headers: {
        'Content-Disposition': `attachment; filename="yonagi-adatexport-${date}.json"`,
        // The one response on the site that must never be cached anywhere:
        // it is the whole account in one document.
        'Cache-Control': 'no-store, private',
      },
    });
  },
});
