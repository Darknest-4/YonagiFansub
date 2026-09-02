'use client';

import Image from 'next/image';
import type { ReactNode } from 'react';
import type { ProjectStatus, ProjectType } from '@prisma/client';
import { formatRelative } from '@/shared/lib/utils';
import { PROJECT_TYPE_LABEL, ProjectStatusBadge } from '@/shared/ui/badge';
import { DataTable, type Column } from '@/shared/ui/data-table';

export interface AdminProjectRow {
  id: string;
  slug: string;
  title: string;
  titleNative: string | null;
  coverImageUrl: string | null;
  type: ProjectType;
  status: ProjectStatus;
  episodeCount: number;
  totalEpisodes: number | null;
  updatedAt: string;
}

const columns: Column<AdminProjectRow>[] = [
  {
    key: 'title',
    header: 'Projekt',
    sortable: true,
    render: (row) => (
      <span className="flex items-center gap-3">
        <span className="relative aspect-2/3 w-8 shrink-0 overflow-hidden rounded bg-ink-800">
          {row.coverImageUrl && (
            <Image src={row.coverImageUrl} alt="" fill sizes="32px" className="object-cover" />
          )}
        </span>
        <span className="min-w-0">
          <span className="block truncate">{row.title}</span>
          {row.titleNative && (
            <span lang="ja" className="block truncate font-jp text-2xs text-mist-600">
              {row.titleNative}
            </span>
          )}
        </span>
      </span>
    ),
  },
  {
    key: 'type',
    header: 'Típus',
    width: '9rem',
    render: (row) => (
      <span className="text-xs text-mist-400">{PROJECT_TYPE_LABEL[row.type]}</span>
    ),
  },
  {
    key: 'status',
    header: 'Állapot',
    width: '9rem',
    render: (row) => <ProjectStatusBadge status={row.status} />,
  },
  {
    key: 'episodes',
    header: 'Részek',
    width: '7rem',
    align: 'right',
    render: (row) => (
      <span className="nums text-xs text-mist-300">
        {row.episodeCount}
        {row.totalEpisodes ? ` / ${row.totalEpisodes}` : ''}
      </span>
    ),
  },
  {
    key: 'updatedAt',
    header: 'Frissítve',
    sortable: true,
    width: '9rem',
    align: 'right',
    secondary: true,
    render: (row) => (
      <span className="text-2xs text-mist-500">{formatRelative(row.updatedAt)}</span>
    ),
  },
];

export function AdminProjectTable({
  rows,
  meta,
  emptyState,
}: {
  rows: AdminProjectRow[];
  meta: { page?: number; totalPages?: number; total?: number; perPage?: number };
  emptyState: ReactNode;
}) {
  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowHref={(row) => `/admin/projektek/${row.id}`}
      meta={meta}
      basePath="/admin/projektek"
      searchPlaceholder="Cím, stúdió…"
      emptyState={emptyState}
    />
  );
}
