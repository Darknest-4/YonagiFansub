import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Clapperboard,
  Database,
  FilePlus2,
  HardDrive,
  Images,
  MessageSquare,
  Newspaper,
  Package,
  Play,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ensureAdminAccess } from '@/lib/auth/guards';
import { hasPermission, type Actor, type Permission } from '@/lib/auth/permissions';
import { toActor } from '@/lib/auth/session';
import {
  getDashboardStats,
  getDashboardTrends,
  getWatchTrend,
  getProjectProgressBoard,
  getRecentActivity,
  getTopEpisodes,
  periodDelta,
} from '@/server/stats';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { getMailStatus } from '@/lib/mail';
import { cn, formatCount, formatRelative } from '@/lib/utils';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Skeleton, TableSkeleton } from '@/components/ui/feedback';
import { ProjectStatusBadge } from '@/components/ui/badge';
import { Sparkline } from '@/components/admin/sparkline';
import { StatTile } from '@/components/admin/stat-tile';
import type { ProjectStatus } from '@prisma/client';

export const metadata: Metadata = { title: 'Vezérlőpult' };

export const dynamic = 'force-dynamic';

/**
 * Admin dashboard.
 *
 * Built around one question: what needs attention right now. The stat tiles are
 * status, but the panels below are the actual work queue — unanswered messages,
 * unpublished drafts, and the projects that have stopped moving — because a
 * dashboard that only shows numbers gets looked at once and then ignored.
 *
 * Every panel sits behind its own `Suspense` boundary. They query independently,
 * so one slow aggregate holds up its own card instead of the whole page, and the
 * header and quick actions are usable before any of them resolve.
 */
export default async function AdminDashboard() {
  const user = await ensureAdminAccess();
  const actor = toActor(user);
  const canReadAudit = hasPermission(actor, 'audit:read');

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl">Vezérlőpult</h1>
          <p className="mt-1.5 text-sm text-content-muted">
            Szia, {user.displayName.split(' ')[0]}! Itt van, ami most fontos.
          </p>
        </div>

        <QuickActions actor={actor} />
      </header>

      <Suspense fallback={<StatGridSkeleton />}>
        <StatGrid />
      </Suspense>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Suspense fallback={<Skeleton className="h-72 rounded-xl" />}>
          <WatchTrendPanel />
        </Suspense>

        <Suspense fallback={<Skeleton className="h-72 rounded-xl" />}>
          <NeedsAttentionPanel canReadContact={hasPermission(actor, 'contact:read')} />
        </Suspense>
      </div>

      {hasPermission(actor, 'project:read') && (
        <Suspense fallback={<TableSkeleton rows={5} columns={4} />}>
          <ProjectBoardPanel />
        </Suspense>
      )}

      {/* The audit log is the only permission-gated panel in this row, so the
          row collapses to one column without it rather than leaving a hole. */}
      <div className={cn('grid gap-5', canReadAudit && 'lg:grid-cols-2')}>
        <Suspense fallback={<TableSkeleton rows={5} columns={3} />}>
          <TopEpisodesPanel />
        </Suspense>

        {canReadAudit && (
          <Suspense fallback={<TableSkeleton rows={5} columns={2} />}>
            <ActivityPanel />
          </Suspense>
        )}
      </div>

      <SystemPanel />
    </div>
  );
}

/* ── Quick actions ─────────────────────────────────────────────────────────── */

const QUICK_ACTIONS: Array<{
  href: string;
  label: string;
  permission: Permission;
  icon: LucideIcon;
}> = [
  { href: '/admin/projektek/uj', label: 'Új projekt', permission: 'project:write', icon: FilePlus2 },
  { href: '/admin/hirek/uj', label: 'Új hír', permission: 'news:write', icon: Newspaper },
  { href: '/admin/media', label: 'Médiatár', permission: 'media:write', icon: Images },
];

/**
 * The four things an admin most often arrives wanting to do.
 *
 * Filtered by permission, so an editor without release rights never sees a
 * button that would only take them to a 403. The pages behind them enforce the
 * same permission independently — hiding the button is convenience, not access
 * control.
 */
function QuickActions({ actor }: { actor: Actor }) {
  const allowed = QUICK_ACTIONS.filter((action) => hasPermission(actor, action.permission));

  if (allowed.length === 0) return null;

  return (
    <nav aria-label="Gyors műveletek" className="flex flex-wrap gap-2">
      {allowed.map((action) => (
        <Link
          key={action.href}
          href={action.href}
          className="inline-flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-900/60 px-3 py-2 text-xs font-medium text-mist-200 transition-colors duration-fast hover:border-bloom-500/40 hover:bg-ink-850 hover:text-bloom-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bloom-400"
        >
          <action.icon className="size-3.5 shrink-0 text-bloom-400" aria-hidden />
          {action.label}
        </Link>
      ))}
    </nav>
  );
}

/* ── Stat tiles ────────────────────────────────────────────────────────────── */

async function StatGrid() {
  const [stats, trends] = await Promise.all([getDashboardStats(), getDashboardTrends(14)]);

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <StatTile
        label="Projektek"
        value={stats.projects.total}
        detail={`${stats.projects.ongoing} fut · ${stats.projects.draft} piszkozat`}
        icon={<Clapperboard className="size-4" aria-hidden />}
        href="/admin/projektek"
        trend={trends.projects}
        delta={periodDelta(trends.projects)}
      />
      <StatTile
        label="Megjelent részek"
        value={stats.episodes.released}
        detail={`${stats.episodes.releasedThisMonth} ebben a hónapban`}
        icon={<Package className="size-4" aria-hidden />}
        tone="orchid"
        trend={trends.episodes}
        delta={periodDelta(trends.episodes)}
      />
      <StatTile
        label="Epizódok"
        value={stats.episodes.total}
        detail={`${stats.episodes.inProgress} folyamatban`}
        icon={<Clapperboard className="size-4" aria-hidden />}
        tone="info"
        trend={trends.episodes}
        delta={periodDelta(trends.episodes)}
      />
      <StatTile
        label="Nézés (30 nap)"
        value={stats.watches.last30Days}
        detail={`${formatCount(stats.watches.total)} összesen`}
        icon={<Play className="size-4" aria-hidden />}
        tone="warm"
        trend={trends.watches}
        delta={periodDelta(trends.watches)}
      />
      <StatTile
        label="Felhasználók"
        value={stats.users.active}
        detail={`+${stats.users.newThisMonth} ebben a hónapban`}
        icon={<Users className="size-4" aria-hidden />}
        href="/admin/felhasznalok"
        tone="success"
        trend={trends.users}
        delta={periodDelta(trends.users)}
      />
    </div>
  );
}

function StatGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {Array.from({ length: 5 }, (_, index) => (
        <Skeleton key={index} className="h-40 rounded-xl" />
      ))}
    </div>
  );
}

/* ── Panels ────────────────────────────────────────────────────────────────── */

async function WatchTrendPanel() {
  const trend = await getWatchTrend(30);
  const total = trend.reduce((sum, point) => sum + point.count, 0);
  const peak = trend.reduce((max, point) => Math.max(max, point.count), 0);

  return (
    <Card>
      <CardHeader
        title="Megkezdett nézések – utolsó 30 nap"
        description={`Összesen ${formatCount(total)}, csúcsnap ${formatCount(peak)}`}
      />
      <CardBody>
        <Sparkline data={trend} id="watches" />
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
        }
      : null,
    stats.comments.pending > 0
      ? {
          label: 'Moderálásra váró hozzászólás',
          count: stats.comments.pending,
          href: '/admin/hozzaszolasok',
        }
      : null,
    stats.episodes.inProgress > 0
      ? {
          label: 'Munkában lévő epizód',
          count: stats.episodes.inProgress,
          href: '/admin/projektek?status=ONGOING',
        }
      : null,
    drafts > 0
      ? { label: 'Piszkozat projekt', count: drafts, href: '/admin/projektek?status=DRAFT' }
      : null,
  ].filter((item): item is { label: string; count: number; href: string } => item !== null);

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

/**
 * Project progress board.
 *
 * A table rather than a card grid: these rows are meant to be compared against
 * each other — which one is behind — and comparison is what a table's aligned
 * columns are for.
 */
async function ProjectBoardPanel() {
  const projects = await getProjectProgressBoard(6);

  return (
    <Card>
      <CardHeader
        title="Futó projektek"
        description="Az átlag csak a még meg nem jelent részeket veszi figyelembe."
        action={
          <Link
            href="/admin/projektek"
            className="text-xs font-medium text-bloom-300 underline-offset-4 hover:underline"
          >
            Összes
          </Link>
        }
      />
      <CardBody>
        {projects.length === 0 ? (
          <p className="py-6 text-center text-sm text-mist-500">Nincs futó projekt.</p>
        ) : (
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[34rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink-800 text-left">
                  <th scope="col" className="pb-2 text-2xs font-semibold tracking-wide text-mist-500 uppercase">
                    Projekt
                  </th>
                  <th scope="col" className="pb-2 text-2xs font-semibold tracking-wide text-mist-500 uppercase">
                    Státusz
                  </th>
                  <th scope="col" className="pb-2 text-right text-2xs font-semibold tracking-wide text-mist-500 uppercase">
                    Rész
                  </th>
                  <th scope="col" className="w-40 pb-2 pl-4 text-2xs font-semibold tracking-wide text-mist-500 uppercase">
                    Készültség
                  </th>
                </tr>
              </thead>

              <tbody>
                {projects.map((project) => (
                  <tr key={project.id} className="border-b border-ink-800/60 last:border-b-0">
                    <td className="py-2.5 pr-3">
                      <Link
                        href={`/admin/projektek/${project.id}`}
                        className="line-clamp-1 font-medium text-mist-100 transition-colors hover:text-bloom-300"
                      >
                        {project.title}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-3">
                      <ProjectStatusBadge status={project.status as ProjectStatus} />
                    </td>
                    <td className="nums py-2.5 pr-3 text-right text-2xs text-mist-400">
                      {project.releasedEpisodes}
                      <span className="text-mist-600"> / {project.totalEpisodes}</span>
                    </td>
                    <td className="py-2.5 pl-4">
                      {project.progress === null ? (
                        <span className="text-2xs text-mist-600">Nincs nyitott rész</span>
                      ) : (
                        <div className="flex items-center gap-2.5">
                          <div
                            aria-hidden
                            className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-800"
                          >
                            <div
                              className="h-full rounded-full bg-linear-to-r from-bloom-500 to-orchid-500"
                              style={{ width: `${project.progress}%` }}
                            />
                          </div>
                          <span className="nums w-9 shrink-0 text-right text-2xs text-mist-300">
                            {project.progress}%
                          </span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

async function TopEpisodesPanel() {
  const episodes = await getTopEpisodes(6);

  return (
    <Card>
      <CardHeader
        title="Legtöbbet nézett részek"
        action={
          <Link
            href="/admin/videok"
            className="text-xs font-medium text-bloom-300 underline-offset-4 hover:underline"
          >
            Videóforrások
          </Link>
        }
      />
      <CardBody>
        {episodes.length === 0 ? (
          <p className="py-6 text-center text-sm text-mist-500">Még nincs megjelent rész.</p>
        ) : (
          <ol className="space-y-1">
            {episodes.map((episode, index) => (
              <li key={episode.id}>
                <Link
                  href={`/projektek/${episode.project.slug}/${episode.number.replace(/\.00$/, '')}`}
                  className="flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-ink-850"
                >
                  <span className="nums w-5 shrink-0 text-2xs text-mist-600">{index + 1}.</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-mist-200">
                    {episode.project.title}
                    <span className="nums ml-1.5 text-mist-500">
                      {episode.number.replace(/\.00$/, '')}. rész
                    </span>
                  </span>
                  <span className="nums shrink-0 text-2xs text-mist-400">
                    {formatCount(episode.views)}
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
            className="text-xs font-medium text-bloom-300 underline-offset-4 hover:underline"
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
                  className="mt-1.5 size-1.5 shrink-0 rounded-full bg-bloom-400/60"
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

/**
 * Deployment status.
 *
 * Reports how this instance is *configured*, not what its secrets are: which
 * storage driver is active, which mail driver, whether the search index is the
 * database or an external service. That is the information you need at 2am to
 * know why an upload went nowhere, and none of it is sensitive on its own.
 *
 * Nothing here reads a key, a URL, or a credential — a dashboard is a screen
 * people screenshot, and a screenshot of a connection string is a leak.
 */
async function SystemPanel() {
  /*
    The mail row is the one that has to ask rather than assume.

    Every other row here is a setting read back to you, but "MAIL_DRIVER=resend"
    does not mean mail leaves the building: an unverified sender domain rejects
    every message, and because sending is fire-and-forget nothing on the site
    ever looks wrong. This asks Resend and reports the answer.
  */
  const mail = await getMailStatus();

  const rows: Array<{ label: string; value: string; ok: boolean; icon: LucideIcon; detail?: string }> = [
    {
      label: 'Adatbázis',
      value: 'PostgreSQL',
      ok: true,
      icon: Database,
    },
    {
      label: 'Tárhely',
      value: env.MEDIA_DRIVER === 's3' ? 'S3-kompatibilis' : 'Helyi lemez',
      ok: true,
      icon: HardDrive,
    },
    {
      label: 'E-mail',
      value: mail.driver,
      ok: mail.ok,
      detail: mail.detail,
      icon: MessageSquare,
    },
    {
      label: 'Környezet',
      value: env.NODE_ENV === 'production' ? 'Éles' : 'Fejlesztői',
      ok: env.NODE_ENV === 'production',
      icon: Package,
    },
  ];

  return (
    <Card>
      <CardHeader
        title="Rendszer állapota"
        description="Ennek a példánynak a beállításai — érzékeny adat nélkül."
      />
      <CardBody>
        <dl className="grid gap-2 sm:grid-cols-2">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-start gap-3 rounded-lg border border-ink-800 bg-ink-900/50 px-3.5 py-2.5"
            >
              <row.icon className="mt-0.5 size-4 shrink-0 text-mist-500" aria-hidden />
              <div className="min-w-0 flex-1">
                <dt className="text-2xs tracking-wide text-mist-500 uppercase">{row.label}</dt>
                <dd className="truncate text-sm text-mist-200">{row.value}</dd>
                {/* A magyarázat csak ott jelenik meg, ahol van mit mondani —
                    jellemzően amikor a lámpa nem zöld, és tudni kell, miért. */}
                {row.detail && (
                  <dd className="mt-0.5 text-2xs leading-snug text-mist-500">{row.detail}</dd>
                )}
              </div>
              <span
                aria-hidden
                className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                  row.ok ? 'bg-success-400' : 'bg-ember-400'
                }`}
              />
            </div>
          ))}
        </dl>
      </CardBody>
    </Card>
  );
}
