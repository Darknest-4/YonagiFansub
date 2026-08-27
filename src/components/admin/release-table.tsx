'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import type { PublishStatus, ReleaseKind, Resolution } from '@prisma/client';
import { Send } from 'lucide-react';
import { formatBytes, formatCount, formatDate, formatEpisodeNumber } from '@/lib/utils';
import {
  PublishStatusBadge,
  RELEASE_KIND_LABEL,
  RESOLUTION_LABEL,
} from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { DataTable, type Column } from '@/components/admin/data-table';
import { ApiError, apiFetch } from '@/lib/client/api';

export interface AdminReleaseRow {
  id: string;
  projectTitle: string;
  projectSlug: string;
  coverImageUrl: string | null;
  episodeNumber: number | null;
  kind: ReleaseKind;
  version: number;
  resolution: Resolution;
  status: PublishStatus;
  fileSizeBytes: string | null;
  releasedAt: string | null;
  downloadCount: number;
  linkCount: number;
}

const columns: Column<AdminReleaseRow>[] = [
  {
    key: 'project',
    header: 'Kiadás',
    render: (row) => (
      <span className="flex items-center gap-3">
        <span className="relative aspect-2/3 w-8 shrink-0 overflow-hidden rounded bg-ink-800">
          {row.coverImageUrl && (
            <Image src={row.coverImageUrl} alt="" fill sizes="32px" className="object-cover" />
          )}
        </span>
        <span className="min-w-0">
          <span className="block truncate">{row.projectTitle}</span>
          <span className="nums block truncate text-2xs text-mist-600">
            {row.episodeNumber !== null
              ? `${formatEpisodeNumber(row.episodeNumber)}. rész`
              : RELEASE_KIND_LABEL[row.kind]}
            {row.version > 1 ? ` · v${row.version}` : ''}
          </span>
        </span>
      </span>
    ),
  },
  {
    key: 'spec',
    header: 'Spec',
    width: '8rem',
    render: (row) => (
      <span className="font-mono text-2xs text-mist-400">
        {RESOLUTION_LABEL[row.resolution]}
        {row.fileSizeBytes && (
          <span className="block text-mist-600">{formatBytes(BigInt(row.fileSizeBytes))}</span>
        )}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Állapot',
    width: '8rem',
    render: (row) => <PublishStatusBadge status={row.status} />,
  },
  {
    key: 'links',
    header: 'Linkek',
    width: '5rem',
    align: 'right',
    secondary: true,
    render: (row) => (
      <span
        className={row.linkCount === 0 ? 'nums text-xs text-danger-400' : 'nums text-xs text-mist-300'}
        title={row.linkCount === 0 ? 'Nincs letöltési link!' : undefined}
      >
        {row.linkCount}
      </span>
    ),
  },
  {
    key: 'downloadCount',
    header: 'Letöltés',
    sortable: true,
    width: '7rem',
    align: 'right',
    render: (row) => (
      <span className="nums text-xs text-mist-300">{formatCount(row.downloadCount)}</span>
    ),
  },
  {
    key: 'releasedAt',
    header: 'Megjelent',
    sortable: true,
    width: '8rem',
    align: 'right',
    secondary: true,
    render: (row) => (
      <span className="text-2xs text-mist-500">{formatDate(row.releasedAt)}</span>
    ),
  },
];

export function AdminReleaseTable({
  rows,
  meta,
  emptyState,
  canPublish,
}: {
  rows: AdminReleaseRow[];
  meta: { page?: number; totalPages?: number; total?: number; perPage?: number };
  emptyState: ReactNode;
  canPublish: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [publishing, setPublishing] = useState<string[] | null>(null);

  const publish = async () => {
    if (!publishing) return;

    try {
      const result = await apiFetch<{ published: number }>('/api/v1/admin/releases/publish', {
        method: 'POST',
        body: { ids: publishing },
      });

      toast.success(
        `${result.published} kiadás publikálva`,
        'A követők értesítést kapnak róla.',
      );
      router.refresh();
    } catch (error) {
      toast.error(
        'Publikálás sikertelen',
        error instanceof ApiError ? error.message : 'Próbáld újra.',
      );
    }
  };

  return (
    <>
      <DataTable
        rows={rows}
        columns={columns}
        rowHref={(row) => `/admin/kiadasok/${row.id}`}
        meta={meta}
        basePath="/admin/kiadasok"
        searchPlaceholder="Projekt címe…"
        emptyState={emptyState}
        bulkActions={
          canPublish
            ? (selected) => (
                <Button
                  variant="primary"
                  size="xs"
                  leadingIcon={<Send className="size-3.5" aria-hidden />}
                  onClick={() => setPublishing(selected)}
                >
                  Publikálás
                </Button>
              )
            : undefined
        }
      />

      <ConfirmDialog
        open={Boolean(publishing)}
        onClose={() => setPublishing(null)}
        onConfirm={publish}
        title="Kiadások publikálása"
        description={`${publishing?.length ?? 0} kiadás azonnal láthatóvá válik, és a projekteket követő felhasználók értesítést kapnak. Ez nem vonható vissza értesítés-szinten.`}
        confirmLabel="Publikálom"
        tone="primary"
      />
    </>
  );
}
