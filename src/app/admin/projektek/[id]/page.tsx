import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { ensurePermission } from '@/lib/auth/guards';
import { hasPermission } from '@/lib/auth/permissions';
import { toActor } from '@/lib/auth/session';
import { listGenres } from '@/server/projects';
import { getAdminProject } from '@/server/admin/projects';
import { isAppError } from '@/lib/errors';
import { ProjectForm } from '@/components/admin/project-form';
import type { ProjectFormValues } from '@/lib/forms/defaults';
import { EpisodeManager } from '@/components/admin/episode-manager';
import { db } from '@/lib/db';

export const metadata: Metadata = { title: 'Projekt szerkesztése' };
export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function EditProjectPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { id } = await params;

  // `?video=<episodeId>` is how the coverage overview hands off: the episode's
  // source panel opens on arrival, so a missing source is one click from the
  // list that found it rather than a hunt through the episode list.
  const query = await searchParams;
  const rawVideo = query.video;
  const openVideoFor = Array.isArray(rawVideo) ? (rawVideo[0] ?? null) : (rawVideo ?? null);
  const user = await ensurePermission('project:write', `/admin/projektek/${id}`);
  const actor = toActor(user);

  const project = await getAdminProject(id).catch((error) => {
    if (isAppError(error) && error.code === 'NOT_FOUND') notFound();
    throw error;
  });

  const [genres, episodes] = await Promise.all([
    listGenres(),
    db.episode.findMany({
      where: { projectId: id, deletedAt: null },
      orderBy: { number: 'asc' },
      select: {
        id: true,
        number: true,
        title: true,
        status: true,
        airedAt: true,
        progressTranslation: true,
        progressTiming: true,
        progressTypesetting: true,
        progressEditing: true,
        progressEncoding: true,
        progressQc: true,
        _count: { select: { videos: { where: { deletedAt: null } } } },
      },
    }),
  ]);

  const initial: ProjectFormValues = {
    slug: project.slug,
    title: project.title,
    titleRomaji: project.titleRomaji ?? '',
    titleNative: project.titleNative ?? '',
    titleEnglish: project.titleEnglish ?? '',
    synonyms: project.synonyms.join(', '),
    synopsis: project.synopsis ?? '',
    type: project.type,
    status: project.status,
    publishStatus: project.publishStatus,
    season: project.season ?? '',
    seasonYear: project.seasonYear?.toString() ?? '',
    totalEpisodes: project.totalEpisodes?.toString() ?? '',
    ageRating: project.ageRating ?? '',
    studio: project.studio ?? '',
    source: project.source ?? '',
    durationMin: project.durationMin?.toString() ?? '',
    coverImageUrl: project.coverImageUrl ?? '',
    bannerImageUrl: project.bannerImageUrl ?? '',
    trailerUrl: project.trailerUrl ?? '',
    accentColor: project.accentColor ?? '',
    malId: project.malId?.toString() ?? '',
    anilistId: project.anilistId?.toString() ?? '',
    isFeatured: project.isFeatured,
    genreIds: project.genres.map((entry) => entry.genreId),
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl">{project.title}</h1>
          <p className="nums mt-1 text-sm text-content-muted">
            {project._count.episodes} epizód
          </p>
        </div>

        {project.publishStatus === 'PUBLISHED' && (
          <Link
            href={`/projektek/${project.slug}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-bloom-300 underline-offset-4 hover:underline"
          >
            Megnézem élesben
            <ExternalLink className="size-3.5" aria-hidden />
          </Link>
        )}
      </header>

      <ProjectForm
        projectId={project.id}
        initial={initial}
        genres={genres.map((genre) => ({ id: genre.id, name: genre.name }))}
        canDelete={hasPermission(actor, 'project:delete')}
        canPublish={hasPermission(actor, 'project:publish')}
      />

      <EpisodeManager
        projectId={project.id}
        openVideoFor={openVideoFor}
        canDelete={hasPermission(actor, 'episode:delete')}
        episodes={episodes.map((episode) => ({
          id: episode.id,
          number: Number(episode.number),
          title: episode.title,
          status: episode.status,
          airedAt: episode.airedAt?.toISOString() ?? null,
          videoCount: episode._count.videos,
          progressTranslation: episode.progressTranslation,
          progressTiming: episode.progressTiming,
          progressTypesetting: episode.progressTypesetting,
          progressEditing: episode.progressEditing,
          progressEncoding: episode.progressEncoding,
          progressQc: episode.progressQc,
        }))}
      />
    </div>
  );
}
