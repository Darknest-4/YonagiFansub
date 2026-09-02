import type { Metadata } from 'next';
import Link from 'next/link';
import { GitCommitVertical, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/site/page-header';
import { EmptyState } from '@/components/ui/feedback';
import {
  CHANGELOG,
  CHANGE_KIND_LABELS,
  changelogStats,
  type ChangeKind,
  type ChangelogEntry,
} from '@/content/changelog';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Fejlesztési napló',
  description:
    'Mi épült meg a Yonagi Fansub oldalán, és mikor. Minden változás dátummal, magyarázattal és a hozzá tartozó commit azonosítójával.',
  alternates: { canonical: '/fejlesztes' },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * The public development log.
 *
 * ## Why a fansub site has one at all
 *
 * Because the site is visibly changing under its readers, and a page that
 * explains the changes is the difference between "they are working on it" and
 * "it broke again". It is also the honest counterpart to the beta banner: the
 * banner says the site is unfinished, and this says what unfinished has meant
 * so far. A notice with no evidence behind it reads as an excuse.
 *
 * ## Grouped by day, newest first
 *
 * The unit is the day rather than a version number, because this project does
 * not ship versions — it ships continuously, and inventing a `v1.4.0` to head a
 * section would be a label with nothing behind it. Days are what actually
 * happened.
 *
 * ## Where the on/off check is
 *
 * In `layout.tsx` next to this file, not here — the segment has a `loading.tsx`,
 * and a `notFound()` raised inside that Suspense boundary lands after the 200
 * has already been flushed. The layout runs before the flush.
 *
 * ## The filter is a link, not a button
 *
 * Filtering by kind goes through the query string and re-renders on the server.
 * That costs a round trip a client-side filter would not, and buys three things
 * worth more than it: the filtered view has an address somebody can send, it
 * works before (and without) JavaScript, and the page stays a server component
 * with no state to get out of sync with the URL.
 */
export default async function ChangelogPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const rawKind = Array.isArray(raw.tipus) ? raw.tipus[0] : raw.tipus;
  // An unknown value in the query string shows everything rather than nothing —
  // a hand-edited or truncated link should still land on a readable page.
  const kind = isKind(rawKind) ? rawKind : null;

  const entries: ChangelogEntry[] = kind
    ? CHANGELOG.map((entry) => ({
        ...entry,
        changes: entry.changes.filter((change) => change.kind === kind),
      })).filter((entry) => entry.changes.length > 0)
    : CHANGELOG;

  const stats = changelogStats();

  // Only the kinds that actually occur get a chip. A filter that always comes
  // back empty is a promise the page cannot keep.
  const presentKinds = [...new Set(CHANGELOG.flatMap((e) => e.changes.map((c) => c.kind)))];

  return (
    <div className="container-content py-10 lg:py-14">
      <PageHeader
        eyebrow="Fejlesztés"
        title="Fejlesztési napló"
        description="Mi épült meg az oldalon, és mikor. Minden bejegyzés mögött valódi kód áll — a commit azonosítója ott van mellette."
        crumbs={[{ label: 'Fejlesztési napló' }]}
      />

      <aside className="mt-6 flex gap-3 rounded-xl border border-info-500/25 bg-info-500/8 px-4 py-3.5">
        <Info className="mt-0.5 size-4 shrink-0 text-info-400" aria-hidden />
        <p className="text-2xs leading-relaxed text-mist-300 sm:text-xs">
          Ez a napló <strong className="text-mist-100">az oldalról</strong> szól, nem a
          feliratokról. A megjelent részeket a{' '}
          <Link href="/projektek" className="text-info-400 underline decoration-info-400/40 underline-offset-4 hover:decoration-info-400">
            projektek
          </Link>{' '}
          oldalán találod. Ide az kerül, ami a weboldal működésén változott — új funkció, javítás,
          biztonsági munka.
        </p>
      </aside>

      <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Bejegyzés" value={String(stats.entries)} />
        <Stat label="Változás" value={String(stats.changes)} />
        <Stat label="Első nap" value={stats.first ? formatDay(stats.first) : '—'} />
        <Stat label="Utolsó nap" value={stats.last ? formatDay(stats.last) : '—'} />
      </dl>

      <nav aria-label="Szűrés típus szerint" className="mt-8 flex flex-wrap gap-2">
        <FilterChip href="/fejlesztes" active={kind === null} label="Mind" />
        {presentKinds.map((item) => (
          <FilterChip
            key={item}
            href={`/fejlesztes?tipus=${item}`}
            active={kind === item}
            label={CHANGE_KIND_LABELS[item]}
          />
        ))}
      </nav>

      {entries.length === 0 ? (
        <EmptyState
          className="mt-10"
          icon={<GitCommitVertical className="size-6" aria-hidden />}
          title="Ebből a típusból még nincs bejegyzés"
          description="Válassz másik szűrőt, vagy nézd meg az összes változást."
          action={{ label: 'Összes bejegyzés', href: '/fejlesztes' }}
        />
      ) : (
        /*
          A single vertical rule down the left, with a dot per day.

          The line is the whole reason the dates read as a sequence rather than
          as six unrelated cards. It is drawn on the list and not repeated per
          item, so it does not break between entries.
        */
        <ol className="relative mt-10 space-y-10 border-l border-ink-800 pl-6 sm:pl-8">
          {entries.map((entry, index) => (
            <li key={`${entry.date}-${index}`} className="relative">
              <span
                aria-hidden
                className="absolute top-1.5 -left-[1.6875rem] size-2.5 rounded-full bg-bloom-500 ring-4 ring-ink-950 sm:-left-[2.1875rem]"
              />

              <time
                dateTime={entry.date}
                className="text-2xs font-bold tracking-[0.14em] text-bloom-400 uppercase"
              >
                {formatDay(entry.date)}
              </time>

              <h2 className="mt-1.5 text-xl font-bold text-mist-50 sm:text-2xl">{entry.title}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-content-muted">
                {entry.summary}
              </p>

              <ul className="mt-5 space-y-3">
                {entry.changes.map((change) => (
                  <li
                    key={change.title}
                    className="rounded-xl border border-ink-800 bg-ink-900/40 p-4 sm:p-5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <KindBadge kind={change.kind} />
                      {change.commit && (
                        <code className="rounded border border-ink-700 bg-ink-850 px-1.5 py-0.5 font-mono text-[10px] text-mist-500">
                          {change.commit}
                        </code>
                      )}
                    </div>

                    <h3 className="mt-2.5 text-sm font-semibold text-mist-100 sm:text-base">
                      {change.title}
                    </h3>

                    {change.body && (
                      <p className="mt-2 text-sm leading-relaxed text-content-muted">
                        {change.body}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function isKind(value: unknown): value is ChangeKind {
  return typeof value === 'string' && value in CHANGE_KIND_LABELS;
}

/** `2026-09-02` → `2026. szeptember 2.` */
function formatDay(date: string): string {
  return new Intl.DateTimeFormat('hu-HU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Europe/Budapest',
  }).format(new Date(`${date}T12:00:00Z`));
}

/*
  The status hues (info, success, danger, warning) only define 400/500/900 in
  the theme, so 300 is not a colour here — Tailwind emits nothing for an
  unresolvable token, and the badge would come out with inherited text on a
  tinted background. The brand hues do have a 300, and it reads better against
  the tint, so they use it.
*/
const KIND_STYLES: Record<ChangeKind, string> = {
  new: 'bg-bloom-500/12 text-bloom-300 ring-bloom-500/25',
  improved: 'bg-orchid-500/12 text-orchid-300 ring-orchid-500/25',
  fixed: 'bg-info-500/12 text-info-400 ring-info-500/25',
  security: 'bg-danger-500/12 text-danger-400 ring-danger-500/25',
  performance: 'bg-success-500/12 text-success-400 ring-success-500/25',
  infra: 'bg-ink-700/50 text-mist-400 ring-ink-600/50',
};

function KindBadge({ kind }: { kind: ChangeKind }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-2xs font-bold tracking-wide uppercase ring-1',
        KIND_STYLES[kind],
      )}
    >
      {CHANGE_KIND_LABELS[kind]}
    </span>
  );
}

function FilterChip({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      // `aria-current` rather than only a colour: the active filter has to be
      // announced, not just look different.
      aria-current={active ? 'true' : undefined}
      className={cn(
        'rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors duration-fast',
        active
          ? 'border-bloom-400/40 bg-bloom-500/12 text-bloom-200'
          : 'border-ink-700 bg-ink-900/60 text-mist-400 hover:border-ink-600 hover:text-mist-200',
      )}
    >
      {label}
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-ink-800 bg-ink-900/40 px-4 py-3">
      <dt className="text-2xs tracking-wide text-mist-500 uppercase">{label}</dt>
      <dd className="mt-1 text-sm font-bold text-mist-50">{value}</dd>
    </div>
  );
}
