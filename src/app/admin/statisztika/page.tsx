import type { Metadata } from 'next';
import { Clapperboard, MessageSquare, Package, Play, Users } from 'lucide-react';
import { ensurePermission } from '@/shared/auth/guards';
import { getDashboardStats, getTopEpisodes, getWatchTrend } from '@/features/stats/service';
import { formatCount, formatDate } from '@/shared/lib/utils';
import { Card, CardBody, CardHeader } from '@/shared/ui/card';
import { Sparkline } from '@/features/stats/components/sparkline';
import { StatTile } from '@/features/stats/components/stat-tile';

export const metadata: Metadata = { title: 'Statisztika' };
export const dynamic = 'force-dynamic';

export default async function AdminStatsPage() {
  await ensurePermission('stats:read', '/admin/statisztika');

  const [stats, trend, top] = await Promise.all([
    getDashboardStats(),
    getWatchTrend(90),
    getTopEpisodes(15),
  ]);

  const total90 = trend.reduce((sum, point) => sum + point.count, 0);
  const average = Math.round(total90 / Math.max(1, trend.length));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl">Statisztika</h1>
        <p className="mt-1 text-sm text-content-muted">
          Minden szám a saját adatbázisunkból jön — nincs külső analitika, nincs követő
          szkript az oldalon.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Publikált projekt"
          value={stats.projects.total - stats.projects.draft}
          detail={`${stats.projects.ongoing} fut · ${stats.projects.completed} kész`}
          icon={<Clapperboard className="size-4" aria-hidden />}
        />
        <StatTile
          label="Kiadott epizód"
          value={stats.episodes.released}
          detail={`${stats.episodes.inProgress} munkában`}
          icon={<Package className="size-4" aria-hidden />}
          tone="orchid"
        />
        <StatTile
          label="Megkezdett nézés"
          value={stats.watches.total}
          detail={`napi átlag ${formatCount(average)} (90 nap)`}
          icon={<Play className="size-4" aria-hidden />}
          tone="warm"
        />
        <StatTile
          label="Regisztrált felhasználó"
          value={stats.users.total}
          detail={`${stats.users.active} aktív`}
          icon={<Users className="size-4" aria-hidden />}
          tone="success"
        />
      </div>

      <Card>
        <CardHeader
          title="Nézési trend – 90 nap"
          description={`${formatCount(total90)} megkezdett nézés, napi átlag ${formatCount(average)}`}
        />
        <CardBody>
          <Sparkline data={trend} height={220} />
        </CardBody>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Legnépszerűbb részek" />
          <CardBody>
            <ol className="space-y-1">
              {top.map((episode, index) => (
                <li
                  key={episode.id}
                  className="flex items-center gap-3 rounded-lg px-2.5 py-2 odd:bg-ink-900/40"
                >
                  <span className="nums w-6 shrink-0 text-2xs text-mist-600">{index + 1}.</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-mist-200">
                    {episode.project.title}
                    <span className="nums ml-1.5 text-mist-500">
                      {episode.number.replace(/\.00$/, '')}. rész
                    </span>
                  </span>
                  <span className="nums shrink-0 text-xs text-mist-400">
                    {formatCount(episode.views)}
                  </span>
                  <span className="hidden w-24 shrink-0 text-right text-2xs text-mist-600 sm:block">
                    {formatDate(episode.releasedAt)}
                  </span>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Közösség" />
          <CardBody>
            <dl className="space-y-3.5">
              <StatRow
                icon={<MessageSquare className="size-4" aria-hidden />}
                label="Moderálásra váró hozzászólás"
                value={stats.comments.pending}
              />
              <StatRow
                icon={<MessageSquare className="size-4" aria-hidden />}
                label="Új üzenet"
                value={stats.contact.new}
              />
              <StatRow
                icon={<MessageSquare className="size-4" aria-hidden />}
                label="Feldolgozás alatt"
                value={stats.contact.inProgress}
              />
              <StatRow
                icon={<Users className="size-4" aria-hidden />}
                label="Új regisztráció (hónap)"
                value={stats.users.newThisMonth}
              />
              <StatRow
                icon={<Play className="size-4" aria-hidden />}
                label="Nézés (7 nap)"
                value={stats.watches.last7Days}
              />
            </dl>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function StatRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden className="text-mist-600">
        {icon}
      </span>
      <dt className="min-w-0 flex-1 text-sm text-mist-300">{label}</dt>
      <dd className="nums shrink-0 text-sm font-semibold text-mist-100">
        {formatCount(value)}
      </dd>
    </div>
  );
}
