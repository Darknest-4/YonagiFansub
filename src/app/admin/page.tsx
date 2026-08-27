import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Clapperboard,
  Download,
  Package,
  Users,
} from 'lucide-react';
import { ensureAdminAccess } from '@/lib/auth/guards';
import { hasPermission } from '@/lib/auth/permissions';
import { toActor } from '@/lib/auth/session';
import {
  getDashboardStats,
  getDownloadTrend,
  getRecentActivity,
  getTopReleases,
} from '@/server/stats';
import { db } from '@/lib/db';
import { formatCount, formatRelative } from '@/lib/utils';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Skeleton, TableSkeleton } from '@/components/ui/feedback';
import { Sparkline } from '@/components/admin/sparkline';
import { StatTile } from '@/components/admin/stat-tile';

export const metadata: Metadata = { title: 'Vezérlőpult' };

export const dynamic = 'force-dynamic';

/**
 * Admin dashboard.
 *
 * Built around one question: what needs attention right now. The stat tiles are
 * status, but the two panels below are the actual work queue — unanswered
 * messages and unpublished drafts — because a dashboard that only shows numbers
 * gets looked at once and then ignored.
 */
export default async function AdminDashboard() {
  const user = await ensureAdminAccess();
  const actor = toActor(user);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl">Vezérlőpult</h1>
        <p className="mt-1.5 text-sm text-content-muted">
          Szia, {user.displayName.split(' ')[0]}! Itt van, ami most fontos.
        </p>
      </header>

      <Suspense fallback={<StatGridSkeleton />}>
        <StatGrid />
      </Suspense>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Suspense fallback={<Skeleton className="h-72 rounded-xl" />}>
          <DownloadTrendPanel />
        </Suspense>

        <Suspense fallback={<Skeleton className="h-72 rounded-xl" />}>
          <NeedsAttentionPanel canReadContact={hasPermission(actor, 'contact:read')} />
        </Suspense>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Suspense fallback={<TableSkeleton rows={5} columns={3} />}>
          <TopReleasesPanel />
        </Suspense>

        {hasPermission(actor, 'audit:read') && (
          <Suspense fallback={<TableSkeleton rows={5} columns={2} />}>
            <ActivityPanel />
          </Suspense>
        )}
      </div>
    </div>
  );
}

async function StatGrid() {
  const stats = await getDashboardStats();

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile
        label="Projektek"
        value={stats.projects.total}
        detail={`${stats.projects.ongoing} fut · ${stats.projects.draft} piszkozat`}
        icon={<Clapperboard className="size-4" aria-hidden />}
        href="/admin/projektek"
      />
      <StatTile
        label="Kiadások"
        value={stats.releases.published}
        detail={`${stats.releases.thisMonth} ebben a hónapban`}
        icon={<Package className="size-4" aria-hidden />}
        href="/admin/kiadasok"
        tone="orchid"
      />
      <StatTile
        label="Letöltés (30 nap)"
        value={stats.downloads.last30Days}
        detail={`${formatCount(stats.downloads.total)} összesen`}
        icon={<Download className="size-4" aria-hidden />}
        tone="warm"
      />
      <StatTile
        label="Felhasználók"
        value={stats.users.active}
        detail={`+${stats.users.newThisMonth} ebben a hónapban`}
        icon={<Users className="size-4" aria-hidden />}
        href="/admin/felhasznalok"
        tone="success"
      />
    </div>
  );
}

function StatGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-28 rounded-xl" />
      ))}
    </div>
  );
}

async function DownloadTrendPanel() {
  const trend = await getDownloadTrend(30);
  const total = trend.reduce((sum, point) => sum + point.count, 0);
  const peak = trend.reduce((max, point) => Math.max(max, point.count), 0);

  return (
    <Card>
      <CardHeader
        title="Letöltések – utolsó 30 nap"
        description={`Összesen ${formatCount(total)}, csúcsnap ${formatCount(peak)}`}
      />
      <CardBody>
        <Sparkline data={trend} />
      </CardBody>
    </Card>
  );
}

async function NeedsAttentionPanel({ canReadContact }: { canReadContact: boolean }) {
  const [stats, drafts] = await Promise.all([
    getDashboardStats(),
    db.project.count({ where: { deletedAt: null, publishStatus: 'DRAFT' } }),
  ]);

  const items = [
    canReadContact && stats.contact.new > 0
      ? {
          label: 'Megválaszolatlan üzenet',
          count: stats.contact.new,
          href: '/admin/uzenetek?status=NEW',
          tone: 'warm' as const,
        }
      : null,
    stats.comments.pending > 0
      ? {
          label: 'Moderálásra váró hozzászólás',
          count: stats.comments.pending,
          href: '/admin/hozzaszolasok',
          tone: 'warn' as const,
        }
      : null,
    stats.releases.scheduled > 0
      ? {
          label: 'Ütemezett kiadás',
          count: stats.releases.scheduled,
          href: '/admin/kiadasok?status=SCHEDULED',
          tone: 'info' as const,
        }
      : null,
    drafts > 0
      ? {
          label: 'Piszkozat projekt',
          count: drafts,
          href: '/admin/projektek?status=DRAFT',
          tone: 'neutral' as const,
        }
      : null,
  ].filter(Boolean) as Array<{ label: string; count: number; href: string; tone: string }>;

  return (
    <Card>
      <CardHeader title="Figyelmet igényel" />
      <CardBody>
        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-mist-500">
            Minden rendben — nincs nyitott feladat.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex items-center gap-3 rounded-lg border border-ink-800 bg-ink-900/50 px-3.5 py-3 transition-colors hover:border-ember-400/30 hover:bg-ink-850"
                >
                  <AlertTriangle className="size-4 shrink-0 text-ember-400" aria-hidden />
                  <span className="min-w-0 flex-1 text-sm text-mist-200">{item.label}</span>
                  <span className="nums shrink-0 rounded-full bg-ember-400/15 px-2 py-0.5 text-2xs font-bold text-ember-300">
                    {item.count}
                  </span>
                  <ArrowRight className="size-3.5 shrink-0 text-mist-600" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

async function TopReleasesPanel() {
  const releases = await getTopReleases(6);

  return (
    <Card>
      <CardHeader
        title="Legtöbbet letöltött kiadások"
        action={
          <Link
            href="/admin/kiadasok?sort=-downloadCount"
            className="text-xs font-medium text-tide-300 underline-offset-4 hover:underline"
          >
            Összes
          </Link>
        }
      />
      <CardBody>
        {releases.length === 0 ? (
          <p className="py-6 text-center text-sm text-mist-500">Még nincs publikált kiadás.</p>
        ) : (
          <ol className="space-y-1">
            {releases.map((release, index) => (
              <li key={release.id}>
                <Link
                  href={`/admin/kiadasok/${release.id}`}
                  className="flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-ink-850"
                >
                  <span className="nums w-5 shrink-0 text-2xs text-mist-600">{index + 1}.</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-mist-200">
                    {release.project.title}
                    {release.episode && (
                      <span className="nums ml-1.5 text-mist-500">
                        {release.episode.number.toString().replace(/\.00$/, '')}. rész
                      </span>
                    )}
                  </span>
                  <span className="nums shrink-0 text-2xs text-mist-400">
                    {formatCount(release.downloadCount)}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}

async function ActivityPanel() {
  const activity = await getRecentActivity(8);

  return (
    <Card>
      <CardHeader
        title="Legutóbbi tevékenység"
        action={
          <Link
            href="/admin/naplo"
            className="text-xs font-medium text-tide-300 underline-offset-4 hover:underline"
          >
            Napló
          </Link>
        }
      />
      <CardBody>
        {activity.length === 0 ? (
          <p className="py-6 text-center text-sm text-mist-500">Még nincs naplózott esemény.</p>
        ) : (
          <ul className="space-y-2.5">
            {activity.map((entry) => (
              <li key={entry.id} className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="mt-1.5 size-1.5 shrink-0 rounded-full bg-tide-400/60"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-mist-200">{entry.summary}</p>
                  <p className="mt-0.5 text-2xs text-mist-600">
                    {entry.actor?.displayName ?? entry.actorLabel ?? 'Rendszer'} ·{' '}
                    {formatRelative(entry.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
