import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ensurePermission } from '@/lib/auth/guards';
import { hasPermission } from '@/lib/auth/permissions';
import { toActor } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { isAppError } from '@/lib/errors';
import { getAdminRelease } from '@/server/admin/releases';
import { listReleaseFormats, listStorageHosts } from '@/server/releases';
import { ReleaseEditor } from '@/components/admin/release-editor';
import { toLocalDateTimeValue, type ReleaseFormValues } from '@/lib/forms/defaults';
import { formatCount } from '@/lib/utils';

export const metadata: Metadata = { title: 'Kiadás szerkesztése' };
export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export default async function EditReleasePage({ params }: { params: Params }) {
  const { id } = await params;
  const user = await ensurePermission('release:write', `/admin/kiadasok/${id}`);

  const release = await getAdminRelease(id).catch((error) => {
    if (isAppError(error) && error.code === 'NOT_FOUND') notFound();
    throw error;
  });

  const [projects, episodes, formats, hosts] = await Promise.all([
    db.project.findMany({
      where: { deletedAt: null },
      orderBy: { title: 'asc' },
      select: { id: true, title: true },
    }),
    db.episode.findMany({
      where: { projectId: release.projectId, deletedAt: null },
      orderBy: { number: 'asc' },
      select: { id: true, number: true, title: true },
    }),
    listReleaseFormats(),
    listStorageHosts(),
  ]);

  const initial: ReleaseFormValues = {
    projectId: release.projectId,
    episodeId: release.episodeId ?? '',
    kind: release.kind,
    version: String(release.version),
    formatId: release.formatId ?? '',
    resolution: release.resolution,
    videoCodec: release.videoCodec ?? '',
    audioCodec: release.audioCodec ?? '',
    subtitleFormat: release.subtitleFormat ?? '',
    fileSizeBytes: release.fileSizeBytes?.toString() ?? '',
    durationSec: release.durationSec?.toString() ?? '',
    crc32: release.crc32 ?? '',
    changelog: release.changelog ?? '',
    notes: release.notes ?? '',
    status: release.status,
    releasedAt: toLocalDateTimeValue(release.releasedAt),
    links: release.links.map((link) => ({
      id: link.id,
      localKey: link.id,
      hostId: link.hostId ?? '',
      kind: link.kind,
      label: link.label ?? '',
      url: link.url,
      isMirror: link.isMirror,
      priority: link.priority,
      availability: link.availability,
    })),
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl">{release.project.title}</h1>
        <p className="nums mt-1 text-sm text-content-muted">
          {release.episode
            ? `${release.episode.number.toString().replace(/\.00$/, '')}. rész`
            : 'Batch / film'}
          {release.version > 1 ? ` · v${release.version}` : ''} ·{' '}
          {formatCount(release.downloadCount)} letöltés
        </p>
      </header>

      <ReleaseEditor
        releaseId={release.id}
        initial={initial}
        projects={projects}
        initialEpisodes={episodes.map((episode) => ({
          id: episode.id,
          number: Number(episode.number),
          title: episode.title,
        }))}
        formats={formats}
        hosts={hosts}
        canDelete={hasPermission(toActor(user), 'release:delete')}
        canPublish={hasPermission(toActor(user), 'release:publish')}
      />
    </div>
  );
}
