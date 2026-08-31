import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, CalendarDays, Clock } from 'lucide-react';
import { env } from '@/lib/env';
import { ogImages } from '@/lib/seo';
import { formatDate, formatDuration, formatEpisodeNumber, toIsoString, truncate } from '@/lib/utils';
import { getEpisode, getEpisodeNeighbours } from '@/server/projects';
import { Breadcrumbs } from '@/components/site/page-header';
import { EpisodeStatusBadge } from '@/components/ui/badge';
import { DownloadPanel, type ReleaseView } from '@/components/site/download-panel';
import { VideoPlayer } from '@/components/site/video-player';
import { Comments } from '@/components/site/comments';
import { listEpisodeVideos } from '@/server/video';
import { getCurrentUser } from '@/lib/auth/guards';
import { db } from '@/lib/db';
import { WorkflowProgress, buildWorkflowStages } from '@/components/ui/progress';

type Params = Promise<{ slug: string; episode: string }>;

/** Episode numbers may be fractional (12.5 recaps), so parsing is not `parseInt`. */
function parseEpisodeNumber(raw: string): number | null {
  const value = Number.parseFloat(decodeURIComponent(raw));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, episode: rawNumber } = await params;
  const number = parseEpisodeNumber(rawNumber);
  if (number === null) return { title: 'Epizód nem található', robots: { index: false } };

  const episode = await getEpisode(slug, number);
  if (!episode) return { title: 'Epizód nem található', robots: { index: false } };

  const label = `${formatEpisodeNumber(episode.number.toString())}. rész`;
  const title = `${episode.project.title} – ${label}`;
  const description = episode.synopsis
    ? truncate(episode.synopsis, 155)
    : `${title}. Magyar felirat a Yonagi Fansubtól, letöltési linkekkel.`;

  return {
    title,
    description,
    alternates: {
      canonical: `/projektek/${slug}/${formatEpisodeNumber(episode.number.toString())}`,
    },
    openGraph: {
      type: 'video.episode',
      title,
      description,
      url: `${env.NEXT_PUBLIC_SITE_URL}/projektek/${slug}/${formatEpisodeNumber(episode.number.toString())}`,
      // A rész saját képe, ha van; különben a sorozat borítója. Ha egyik sincs,
      // a kulcs elmarad, és az oldal a site-szintű OG-képet örökli.
      ...ogImages(episode.thumbnailUrl ?? episode.project.coverImageUrl, title),
    },
  };
}

export default async function EpisodePage({ params }: { params: Params }) {
  const { slug, episode: rawNumber } = await params;
  const number = parseEpisodeNumber(rawNumber);
  if (number === null) notFound();

  const episode = await getEpisode(slug, number);
  if (!episode) notFound();

  const { previous, next } = await getEpisodeNeighbours(episode.project.id, number);

  // Every published source, in the order the team set. The player walks that
  // order on failure, so a dead filehost is a switch rather than a broken page.
  const videos = await listEpisodeVideos(episode.id);

  // Hol hagyta abba. Kijelentkezve nincs mit folytatni és nincs hova menteni —
  // a lejátszó ilyenkor egyáltalán nem jelent semmit.
  const viewer = await getCurrentUser();
  const watch = viewer
    ? await db.watchProgress.findUnique({
        where: { userId_episodeId: { userId: viewer.id, episodeId: episode.id } },
        select: { positionSec: true },
      })
    : null;

  const label = `${formatEpisodeNumber(episode.number.toString())}. rész`;
  const accent = episode.project.accentColor ?? '#f761a8';
  const stages = buildWorkflowStages(episode);
  const released = episode.status === 'RELEASED' && episode.releases.length > 0;

  const releases: ReleaseView[] = episode.releases.map((release) => ({
    id: release.id,
    kind: release.kind,
    version: release.version,
    resolution: release.resolution,
    videoCodec: release.videoCodec,
    audioCodec: release.audioCodec,
    subtitleFormat: release.subtitleFormat,
    // BigInt cannot cross the server/client boundary; the panel parses it back.
    fileSizeBytes: release.fileSizeBytes?.toString() ?? null,
    durationSec: release.durationSec,
    crc32: release.crc32,
    sha256: release.sha256,
    changelog: release.changelog,
    notes: release.notes,
    format: release.format,
    links: release.links,
  }));

  return (
    <div className="relative isolate">
      {/*
        A rész mint önálló egység, a sorozathoz kötve.

        A `partOfSeries` az, amitől a kereső nem különálló oldalak halmazát
        látja, hanem egy sorozat epizódjait — enélkül minden rész magában áll,
        és egyikük sem erősíti a másikat.
      */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'TVEpisode',
            name: episode.title ?? `${formatEpisodeNumber(episode.number.toString())}. rész`,
            episodeNumber: Number(episode.number),
            description: episode.synopsis ?? undefined,
            image: episode.thumbnailUrl ?? episode.project.coverImageUrl ?? undefined,
            url: `${env.NEXT_PUBLIC_SITE_URL}/projektek/${slug}/${formatEpisodeNumber(episode.number.toString())}`,
            datePublished: toIsoString(episode.airedAt),
            timeRequired: episode.durationSec
              ? `PT${Math.round(episode.durationSec / 60)}M`
              : undefined,
            partOfSeries: {
              '@type': 'TVSeries',
              name: episode.project.title,
              url: `${env.NEXT_PUBLIC_SITE_URL}/projektek/${slug}`,
            },
            inLanguage: 'ja',
            subtitleLanguage: 'hu',
          }),
        }}
      />

      <div
        aria-hidden
        className="absolute inset-x-0 top-0 -z-10 h-64"
        style={{
          background: `linear-gradient(180deg, color-mix(in oklab, ${accent} 12%, transparent), transparent)`,
        }}
      />

      <div className="container-content py-8 lg:py-10">
        <Breadcrumbs
          crumbs={[
            { label: 'Projektek', href: '/projektek' },
            { label: episode.project.title, href: `/projektek/${slug}` },
            { label },
          ]}
        />

        <div className="grid gap-8 lg:grid-cols-[1fr_20rem] lg:gap-10">
          <div className="min-w-0">
            <header>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <EpisodeStatusBadge status={episode.status} />
                {episode.project.totalEpisodes && (
                  <span className="nums text-2xs text-mist-500">
                    {formatEpisodeNumber(episode.number.toString())} / {episode.project.totalEpisodes}
                  </span>
                )}
              </div>

              <p className="text-sm font-medium text-bloom-300">
                <Link
                  href={`/projektek/${slug}`}
                  className="underline-offset-4 transition-colors hover:text-bloom-200 hover:underline"
                >
                  {episode.project.title}
                </Link>
              </p>

              <h1 className="mt-1.5 text-2xl sm:text-3xl">
                <span className="nums text-mist-500">{label}</span>
                {episode.title && (
                  <>
                    <span aria-hidden className="mx-2.5 text-mist-700">
                      ·
                    </span>
                    {episode.title}
                  </>
                )}
              </h1>

              {episode.titleNative && (
                <p className="mt-2 font-jp text-sm text-mist-500">{episode.titleNative}</p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-2xs text-mist-500">
                {episode.airedAt && (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="size-3.5" aria-hidden />
                    Sugárzás: {formatDate(episode.airedAt)}
                  </span>
                )}
                {episode.durationSec && (
                  <span className="nums inline-flex items-center gap-1.5">
                    <Clock className="size-3.5" aria-hidden />
                    {formatDuration(episode.durationSec)}
                  </span>
                )}
              </div>
            </header>

            {/*
              The player takes the thumbnail's place when there is something to
              play — the still is a stand-in for the video, so showing both would
              be showing the same frame twice.
            */}
            {videos.length > 0 ? (
              <div className="mt-6">
                <VideoPlayer
                  episodeId={episode.id}
                  resumeAt={watch?.positionSec ?? 0}
                  trackProgress={Boolean(viewer)}
                  sources={videos.map((source) => ({
                    id: source.id,
                    kind: source.kind,
                    label: source.label,
                    resolution: source.resolution,
                    requiresAuth: source.requiresAuth,
                    provider: source.provider,
                  }))}
                  poster={episode.thumbnailUrl}
                />
                {videos.some((source) => source.requiresAuth) && (
                  <p className="mt-2 text-2xs text-mist-500">
                    Egyes források lejátszásához bejelentkezés szükséges.
                  </p>
                )}
              </div>
            ) : (
              episode.thumbnailUrl && (
                <div className="relative mt-6 aspect-16/9 overflow-hidden rounded-xl border border-ink-800 bg-ink-850">
                  <Image
                    src={episode.thumbnailUrl}
                    alt=""
                    fill
                    priority
                    sizes="(min-width: 1024px) 60vw, 100vw"
                    className="object-cover"
                  />
                </div>
              )
            )}

            {episode.synopsis && (
              <p className="mt-6 text-sm leading-relaxed text-mist-300 sm:text-base">
                {episode.synopsis}
              </p>
            )}

            <div className="mt-8">
              {released ? (
                <DownloadPanel releases={releases} />
              ) : (
                <section
                  aria-labelledby="progress"
                  className="rounded-2xl border border-ink-800 bg-ink-900/50 p-5 sm:p-6"
                >
                  <h2 id="progress" className="text-base font-semibold text-mist-50">
                    Ez a rész még készül
                  </h2>
                  <p className="mt-1.5 mb-6 text-sm leading-relaxed text-content-muted">
                    Az alábbi sáv valós állapotot mutat — a csapat minden lépés végén frissíti.
                    Kövesd a projektet, és szólunk, amint megjelenik.
                  </p>
                  <WorkflowProgress stages={stages} />
                </section>
              )}
            </div>

            <nav
              aria-label="Epizódok közötti navigáció"
              className="mt-8 grid gap-3 border-t border-ink-800 pt-6 sm:grid-cols-2"
            >
              {previous ? (
                <NeighbourLink
                  href={`/projektek/${slug}/${formatEpisodeNumber(previous.number.toString())}`}
                  direction="prev"
                  number={formatEpisodeNumber(previous.number.toString())}
                  title={previous.title}
                />
              ) : (
                <span aria-hidden />
              )}

              {next && (
                <NeighbourLink
                  href={`/projektek/${slug}/${formatEpisodeNumber(next.number.toString())}`}
                  direction="next"
                  number={formatEpisodeNumber(next.number.toString())}
                  title={next.title}
                />
              )}
            </nav>

            <Comments
              target={{ episodeId: episode.id }}
              returnTo={`/projektek/${slug}/${formatEpisodeNumber(episode.number.toString())}`}
            />
          </div>

          <aside className="lg:pt-1">
            <div className="sticky top-24 space-y-5">
              <Link
                href={`/projektek/${slug}`}
                className="group flex gap-3 rounded-xl border border-ink-800 bg-ink-900/50 p-3 transition-colors hover:border-ink-600"
              >
                <span className="relative aspect-2/3 w-16 shrink-0 overflow-hidden rounded-lg bg-ink-800">
                  {episode.project.coverImageUrl && (
                    <Image
                      src={episode.project.coverImageUrl}
                      alt=""
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-2xs tracking-wide text-mist-500 uppercase">
                    Projekt
                  </span>
                  <span className="mt-1 block text-sm font-semibold text-mist-100 group-hover:text-bloom-200">
                    {episode.project.title}
                  </span>
                  {episode.project.titleNative && (
                    <span className="mt-0.5 block truncate font-jp text-2xs text-mist-600">
                      {episode.project.titleNative}
                    </span>
                  )}
                </span>
              </Link>

              {released && (
                <section className="rounded-xl border border-ink-800 bg-ink-900/40 p-4">
                  <h2 className="mb-2 text-2xs font-bold tracking-[0.18em] text-mist-500 uppercase">
                    Megjelent
                  </h2>
                  <p className="text-sm text-mist-200">
                    {formatDate(episode.releases[0]?.releasedAt)}
                  </p>
                </section>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function NeighbourLink({
  href,
  direction,
  number,
  title,
}: {
  href: string;
  direction: 'prev' | 'next';
  number: string;
  title: string | null;
}) {
  const isPrev = direction === 'prev';

  return (
    <Link
      href={href}
      rel={isPrev ? 'prev' : 'next'}
      className={`group flex items-center gap-3 rounded-xl border border-ink-800 bg-ink-900/40 p-3.5 transition-colors duration-fast hover:border-bloom-400/30 hover:bg-ink-850 ${
        isPrev ? '' : 'sm:flex-row-reverse sm:text-right'
      }`}
    >
      {isPrev ? (
        <ArrowLeft className="size-4 shrink-0 text-mist-500 group-hover:text-bloom-300" aria-hidden />
      ) : (
        <ArrowRight className="size-4 shrink-0 text-mist-500 group-hover:text-bloom-300" aria-hidden />
      )}

      <span className="min-w-0 flex-1">
        <span className="block text-2xs text-mist-600">
          {isPrev ? 'Előző rész' : 'Következő rész'}
        </span>
        <span className="mt-0.5 block truncate text-sm font-medium text-mist-200 group-hover:text-mist-50">
          <span className="nums">{number}.</span> {title ?? 'rész'}
        </span>
      </span>
    </Link>
  );
}
