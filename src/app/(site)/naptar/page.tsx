import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { CalendarDays, Check, Clock, Info, Subtitles } from 'lucide-react';
import { getSchedule, getUndatedOngoing, type ScheduledEpisode } from '@/features/projects/schedule';
import { getSettings } from '@/features/settings/service';
import { getCurrentUser } from '@/shared/auth/guards';
import { db } from '@/infrastructure/db';
import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';
import { EmptyState } from '@/shared/ui/feedback';
import { PageHeader } from '@/shared/layout/page-header';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Adásnaptár',
  description:
    'Mikor megy le Japánban a következő rész a futó projektjeinkből, és melyikhez van már magyar feliratunk.',
  alternates: { canonical: '/naptar' },
};

const WEEKDAYS = ['vasárnap', 'hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat'];

/**
 * The airing calendar.
 *
 * Entirely derived: a project is here because its status is ONGOING, an episode
 * because it has a broadcast date. Nothing on this page is maintained
 * separately, which is the only way a schedule stays right past its second week.
 *
 * The times shown are the **Japanese broadcast**, and the page says so directly
 * under the breadcrumb rather than in a footnote. Someone who reads "szombat
 * 01:30" and assumes our subtitle appears then would be disappointed on a
 * schedule that never explained itself; the per-episode badges then carry the
 * part that is ours — whether the Hungarian release is out yet.
 */
export default async function SchedulePage() {
  const settings = await getSettings();

  // The `scheduleEnabled` gate lives in this segment's layout, which is the only
  // place it can set a real 404 status — see the note there.
  const [days, undated, user] = await Promise.all([
    getSchedule({
      pastDays: settings.schedulePastDays,
      futureDays: settings.scheduleFutureDays,
    }),
    getUndatedOngoing(),
    getCurrentUser(),
  ]);

  // Followed projects are lifted out of the wall of rows. For a viewer with
  // three favourites, that is the whole reason to open this page.
  const followed = user
    ? new Set(
        (
          await db.favorite.findMany({
            where: { userId: user.id },
            select: { projectId: true },
          })
        ).map((row) => row.projectId),
      )
    : new Set<string>();

  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Budapest' }).format(
    new Date(),
  );

  return (
    <div className="container-content py-10 lg:py-14">
      <PageHeader
        eyebrow="Menetrend"
        title="Adásnaptár"
        description="A futó projektjeink következő részei, ahogy a japán adásrend hozza őket."
        crumbs={[{ label: 'Adásnaptár' }]}
      />

      {/*
        Directly under the breadcrumb, before the calendar itself, because it
        changes how every row below is read. A note at the bottom would be found
        by the people who least need it.
      */}
      <aside className="mt-6 flex gap-3 rounded-xl border border-info-500/25 bg-info-500/8 px-4 py-3.5">
        <Info className="mt-0.5 size-4 shrink-0 text-info-400" aria-hidden />
        <p className="text-2xs leading-relaxed text-mist-300 sm:text-xs">
          Az itt látható időpontok a <strong className="text-mist-100">japán adást</strong> jelölik
          — ilyenkor a rész <strong className="text-mist-100">japánul, jó esetben angol
          felirattal</strong> jelenik meg. A mi magyar feliratunk ennél később készül el; ha egy
          részhez már kiadtuk, a sora mellett külön jelezzük.
        </p>
      </aside>

      {days.length === 0 ? (
        <EmptyState
          className="mt-10"
          icon={<CalendarDays className="size-6" aria-hidden />}
          title="Most nincs mit ütemezni"
          description="Egyik futó projektünkhöz sincs a közeljövőre datált rész. Amint a japán adásrend frissül, itt megjelenik."
          action={{ label: 'Projektek', href: '/projektek' }}
        />
      ) : (
        <ol className="mt-10 space-y-8">
          {days.map((day) => (
            <li key={day.date}>
              <DayHeading date={day.date} isToday={day.date === today} />

              <ul className="mt-3 space-y-2">
                {day.episodes.map((episode) => (
                  <li key={episode.episodeId}>
                    <ScheduleRow
                      episode={episode}
                      followed={followed.has(episode.project.id)}
                    />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}

      {undated.length > 0 && (
        <section className="mt-14" aria-labelledby="undated">
          <h2 id="undated" className="text-lg">
            Dátum nélkül
          </h2>
          <p className="mt-1 text-sm text-content-muted">
            Ezeken dolgozunk, de a következő részük adásrendje még nem ismert.
          </p>

          <ul className="mt-4 flex flex-wrap gap-2">
            {undated.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/projektek/${project.slug}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-ink-800 bg-ink-900/40 px-3 py-2 text-sm text-mist-200 transition-colors hover:border-ink-700 hover:text-bloom-300"
                >
                  {project.title}
                  {followed.has(project.id) && (
                    <span className="text-2xs text-bloom-300">követed</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function DayHeading({ date, isToday }: { date: string; isToday: boolean }) {
  // Parsed as UTC noon so the label never slides a day either way.
  const parsed = new Date(`${date}T12:00:00Z`);
  const weekday = WEEKDAYS[parsed.getUTCDay()] ?? '';
  const formatted = new Intl.DateTimeFormat('hu-HU', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);

  return (
    <h2
      className={cn(
        'flex items-baseline gap-2 border-b pb-2 text-sm',
        isToday ? 'border-bloom-500/40 text-bloom-300' : 'border-ink-800 text-mist-300',
      )}
    >
      <span className="font-medium">{formatted}</span>
      <span className="text-2xs text-mist-600">{weekday}</span>
      {isToday && (
        <Badge tone="accent" size="sm">
          ma
        </Badge>
      )}
    </h2>
  );
}

function ScheduleRow({
  episode,
  followed,
}: {
  episode: ScheduledEpisode;
  followed: boolean;
}) {
  const airedAt = new Date(episode.airedAt);

  const time = new Intl.DateTimeFormat('hu-HU', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Budapest',
  }).format(airedAt);

  const aired = airedAt.getTime() <= Date.now();

  return (
    <Link
      href={`/projektek/${episode.project.slug}`}
      className={cn(
        'flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors duration-fast',
        followed
          ? 'border-bloom-500/35 bg-bloom-500/6 hover:border-bloom-500/60'
          : 'border-ink-800 bg-ink-900/40 hover:border-ink-700',
      )}
    >
      <span className="nums w-12 shrink-0 text-xs font-medium text-mist-400">{time}</span>

      {episode.project.coverImageUrl ? (
        <Image
          src={episode.project.coverImageUrl}
          alt=""
          width={32}
          height={44}
          className="h-11 w-8 shrink-0 rounded object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="grid h-11 w-8 shrink-0 place-items-center rounded bg-ink-850 font-jp text-xs text-ink-600"
        >
          夜
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-mist-100">
          {episode.project.title}
        </span>
        <span className="block truncate text-2xs text-mist-500">
          {episode.number}. rész
          {episode.title ? ` — ${episode.title}` : ''}
        </span>
      </span>

      {/*
        The one thing on this page that is ours rather than the broadcaster's.
        Three states worth distinguishing: our subtitle is out, the episode has
        aired and we are working on it, or it has not aired yet.
      */}
      {episode.subtitled ? (
        <Badge tone="success" size="sm" icon={<Check className="size-3" aria-hidden />}>
          feliratos
        </Badge>
      ) : aired ? (
        <Badge tone="warm" size="sm" icon={<Subtitles className="size-3" aria-hidden />}>
          készül
        </Badge>
      ) : (
        <Badge tone="neutral" size="sm" icon={<Clock className="size-3" aria-hidden />}>
          várható
        </Badge>
      )}

      {followed && (
        <span className="hidden text-2xs text-bloom-300 sm:inline">követed</span>
      )}
    </Link>
  );
}
