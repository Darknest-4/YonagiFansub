import type { Metadata } from 'next';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { ensurePermission } from '@/lib/auth/guards';
import { listAdminFaq } from '@/server/admin/faq';
import { FaqManager } from '@/components/admin/faq-manager';

export const metadata: Metadata = { title: 'GYIK' };
export const dynamic = 'force-dynamic';

export default async function AdminFaqPage() {
  await ensurePermission('faq:write', '/admin/gyik');
  const entries = await listAdminFaq();

  const published = entries.filter((entry) => entry.isPublished).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl">Gyakori kérdések</h1>
          <p className="mt-1 text-sm text-content-muted">
            {entries.length} bejegyzés, ebből {published} látható. A kérdés, amit harmadszor
            kapsz meg e-mailben, ide való.
          </p>
        </div>

        <Link
          href="/gyik"
          className="inline-flex items-center gap-1.5 text-2xs text-mist-400 underline-offset-4 transition-colors hover:text-tide-300 hover:underline"
        >
          Nyilvános oldal
          <ExternalLink className="size-3.5" aria-hidden />
        </Link>
      </header>

      <FaqManager
        entries={entries.map((entry) => ({
          ...entry,
          updatedAt: entry.updatedAt.toISOString(),
        }))}
      />
    </div>
  );
}
