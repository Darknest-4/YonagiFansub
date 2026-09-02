import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, Check, FileVideo, Film, MonitorPlay, Server } from 'lucide-react';
import { ensurePermission } from '@/shared/auth/guards';
import {
  getVideoCoverageSummary,
  listCoverageGaps,
  listProjectCoverage,
} from '@/features/video/coverage';
import { formatDate, formatEpisodeNumber } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';
import { Card, CardBody, CardHeader } from '@/shared/ui/card';
import { EmptyState } from '@/shared/ui/feedback';
import { StatTile } from '@/features/stats/components/stat-tile';

export const metadata: Metadata = { title: 'Videóforrások' };
export const dynamic = 'force-dynamic';

/**
 * Video source coverage.
 *
 * Every other admin screen is organised around editing one thing. This one is
 * organised around a single question — *what is broken right now* — so the
 * failing list comes first, above the summary, and every row is a link into the
 * editor with the right panel already open.
 */
export default async function AdminVideoOverviewPage() {
  await ensurePermission('episode:write', '/admin/videok');

  const [summary, gaps, projects] = await Promise.all([
    getVideoCoverageSummary(),
    listCoverageGaps(),
    listProjectCoverage(),
  ]);

  const coverage =
    summary.releasedEpisodes === 0
      ? null
      : Math.round((summary.coveredEpisodes / summary.releasedEpisodes) * 100);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl">Videóforrások</h1>
        <p className="mt-1 max-w-2xl text-sm text-content-muted">
          Melyik kiadott epizód nézhető meg valóban. A forrásokat továbbra is a projekt
          szerkesztőjében veszed fel — ez az oldal csak megmutatja, hol hiányoznak.
        </p>
      </header>

      <Card>
        <CardHeader
          title="Hiányzó forrás"
          description={
            gaps.length === 0
              ? 'Minden kiadott epizódhoz tartozik publikált forrás.'
              : `${gaps.length} kiadott epizód nem játszható le.`
          }
          action={
            gaps.length > 0 ? (
              <Badge tone="danger" icon={<AlertTriangle className="size-3" aria-hidden />}>
                {gaps.length}
              </Badge>
            ) : (
              <Badge tone="success" icon={<Check className="size-3" aria-hidden />}>
                Rendben
              </Badge>
            )
          }
        />
        <CardBody>
          {gaps.length === 0 ? (
            <EmptyState
              title="Nincs hiányzó forrás"
              description="Minden RELEASED állapotú epizódhoz tartozik legalább egy publikált videóforrás."
              compact
            />
          ) : (
            <ul className="space-y-1.5">
              {gaps.map((gap) => (
                <li key={gap.episodeId}>
                  <Link
                    href={`/admin/projektek/${gap.projectId}?video=${gap.episodeId}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-ink-800 bg-ink-900/40 px-3 py-2.5 transition-colors duration-fast hover:border-danger-500/40 hover:bg-ink-850 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bloom-400"
                  >
                    <span
                      aria-hidden
                      className="nums grid size-8 shrink-0 place-items-center rounded-lg bg-danger-500/10 font-display text-2xs font-bold text-danger-400"
                    >
                      {formatEpisodeNumber(gap.number)}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-mist-100">
                        {gap.projectTitle}
                      </span>
                      <span className="block truncate text-2xs text-mist-500">
                        {gap.number}. rész
                        {gap.title ? ` — ${gap.title}` : ''}
                        {gap.airedAt ? ` · ${formatDate(gap.airedAt)}` : ''}
                      </span>
                    </span>

                    {gap.draftSources > 0 && (
                      <Badge tone="warning">{gap.draftSources} nem publikált</Badge>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Lefedett epizód"
          value={summary.coveredEpisodes}
          detail={
            coverage === null
              ? 'nincs kiadott epizód'
              : `${summary.releasedEpisodes} kiadottból · ${coverage}%`
          }
          icon={<Check className="size-4" aria-hidden />}
          tone={gaps.length === 0 ? 'success' : 'warm'}
        />
        <StatTile
          label="Saját tárhely (HLS)"
          value={summary.byKind.HLS_PROXY}
          detail="proxyn keresztül, aláírt tokennel"
          icon={<Server className="size-4" aria-hidden />}
        />
        <StatTile
          label="Közvetlen fájl"
          value={summary.byKind.DIRECT_FILE}
          detail="mp4 vagy külső m3u8"
          icon={<FileVideo className="size-4" aria-hidden />}
          tone="orchid"
        />
        <StatTile
          label="Beágyazott"
          value={summary.byKind.EMBED}
          detail={
            summary.unpublished > 0
              ? `${summary.unpublished} forrás nincs publikálva`
              : 'külső lejátszó iframe-ben'
          }
          icon={<MonitorPlay className="size-4" aria-hidden />}
          tone="info"
        />
      </div>

      <Card>
        <CardHeader
          title="Projektenként"
          description="A legtöbb hiánnyal rendelkező projekt van elöl."
        />
        <CardBody>
          {projects.length === 0 ? (
            <EmptyState
              title="Nincs kiadott epizód"
              description="Amint egy epizód RELEASED állapotba kerül, itt megjelenik a lefedettsége."
              compact
            />
          ) : (
            <div className="-mx-1 overflow-x-auto px-1">
              <table className="w-full min-w-[34rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-ink-800 text-left text-2xs tracking-[0.14em] text-mist-500 uppercase">
                    <th scope="col" className="py-2 pr-3 font-semibold">
                      Projekt
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">
                      Kiadott
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">
                      Lefedve
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">
                      Forrás
                    </th>
                    <th scope="col" className="py-2 pl-3 text-right font-semibold">
                      Állapot
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((project) => {
                    const missing = project.released - project.covered;

                    return (
                      <tr
                        key={project.projectId}
                        className="border-b border-ink-850 last:border-0"
                      >
                        <td className="py-2.5 pr-3">
                          <Link
                            href={`/admin/projektek/${project.projectId}`}
                            className="flex items-center gap-2 text-mist-100 underline-offset-4 hover:underline"
                          >
                            <Film className="size-3.5 shrink-0 text-mist-600" aria-hidden />
                            <span className="truncate">{project.title}</span>
                          </Link>
                        </td>
                        <td className="nums px-3 py-2.5 text-right text-mist-300">
                          {project.released}
                        </td>
                        <td className="nums px-3 py-2.5 text-right text-mist-300">
                          {project.covered}
                        </td>
                        <td className="nums px-3 py-2.5 text-right text-mist-500">
                          {project.sources}
                        </td>
                        <td className="py-2.5 pl-3 text-right">
                          {missing === 0 ? (
                            <Badge tone="success">Teljes</Badge>
                          ) : (
                            <Badge tone="danger">{missing} hiányzik</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
