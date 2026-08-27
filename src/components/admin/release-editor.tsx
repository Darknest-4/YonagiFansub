'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ReleaseForm } from '@/components/admin/release-form';
import type { ReleaseFormValues } from '@/lib/forms/defaults';
import { apiFetch } from '@/lib/client/api';

export interface EpisodeOption {
  id: string;
  number: number;
  title: string | null;
}

/**
 * Wraps the release form with on-demand episode loading.
 *
 * Keeping this separate from `ReleaseForm` means the form stays a pure
 * controlled component: it receives episodes, it does not know how they arrive.
 */
export function ReleaseEditor({
  releaseId,
  initial,
  projects,
  initialEpisodes,
  formats,
  hosts,
  canDelete,
}: {
  releaseId?: string;
  initial: ReleaseFormValues;
  projects: Array<{ id: string; title: string }>;
  initialEpisodes: EpisodeOption[];
  formats: Array<{ id: string; label: string; container: string }>;
  hosts: Array<{ id: string; name: string }>;
  canDelete: boolean;
}) {
  const [episodes, setEpisodes] = useState(initialEpisodes);
  const loadedFor = useRef(initial.projectId);

  const loadEpisodes = useCallback(async (projectId: string) => {
    if (!projectId || loadedFor.current === projectId) return;
    loadedFor.current = projectId;

    try {
      const result = await apiFetch<Array<{ id: string; number: string; title: string | null }>>(
        `/api/v1/admin/projects/${projectId}/episodes`,
      );
      // `number` is a Decimal and crosses the wire as a string.
      setEpisodes(result.map((episode) => ({ ...episode, number: Number(episode.number) })));
    } catch {
      setEpisodes([]);
    }
  }, []);

  useEffect(() => {
    void loadEpisodes(initial.projectId);
  }, [initial.projectId, loadEpisodes]);

  return (
    <ReleaseForm
      releaseId={releaseId}
      initial={initial}
      projects={projects}
      episodes={episodes}
      formats={formats}
      hosts={hosts}
      canDelete={canDelete}
      onProjectChange={loadEpisodes}
    />
  );
}
