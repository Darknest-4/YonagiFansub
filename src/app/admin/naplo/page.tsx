import type { Metadata } from 'next';
import { ensurePermission } from '@/shared/auth/guards';
import { db } from '@/infrastructure/db';
import { paginationSchema, toSkipTake, paginationMeta } from '@/shared/api/pagination';
import { formatDateTime } from '@/shared/lib/utils';
import { Avatar } from '@/shared/ui/avatar';
import { Badge, type BadgeTone } from '@/shared/ui/badge';
import { EmptyState } from '@/shared/ui/feedback';
import { Pagination } from '@/shared/ui/pagination';

export const metadata: Metadata = { title: 'Audit napló' };
export const dynamic = 'force-dynamic';

const ACTION_LABEL: Record<string, { label: string; tone: BadgeTone }> = {
  CREATE: { label: 'Létrehozás', tone: 'success' },
  UPDATE: { label: 'Módosítás', tone: 'accent' },
  DELETE: { label: 'Törlés', tone: 'danger' },
  RESTORE: { label: 'Visszaállítás', tone: 'warm' },
  LOGIN: { label: 'Belépés', tone: 'neutral' },
  LOGIN_FAILED: { label: 'Sikertelen belépés', tone: 'warning' },
  LOGOUT: { label: 'Kilépés', tone: 'neutral' },
  PERMISSION_CHANGE: { label: 'Jogosultság', tone: 'orchid' },
  SETTINGS_CHANGE: { label: 'Beállítás', tone: 'orchid' },
  EXPORT: { label: 'Export', tone: 'info' },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Audit log viewer.
 *
 * Read-only by construction — there is no write path to this table anywhere in
 * the application, which is what makes the trail worth anything.
 */
export default async function AuditLogPage({ searchParams }: { searchParams: SearchParams }) {
  await ensurePermission('audit:read', '/admin/naplo');

  const raw = await searchParams;
  const pagination = paginationSchema.parse({
    page: Array.isArray(raw.page) ? raw.page[0] : raw.page,
    perPage: 50,
  });

  const [items, total] = await Promise.all([
    db.auditLog.findMany({
      select: {
        id: true,
        action: true,
        entityType: true,
        summary: true,
        actorLabel: true,
        createdAt: true,
        actor: { select: { displayName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
      ...toSkipTake(pagination),
    }),
    db.auditLog.count(),
  ]);

  const meta = paginationMeta(total, pagination);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl">Audit napló</h1>
        <p className="mt-1 text-sm text-content-muted">
          Minden adminisztrációs művelet nyoma. A napló csak olvasható — nincs olyan
          végpont, amely módosítaná.
        </p>
      </header>

      {items.length === 0 ? (
        <EmptyState title="Üres a napló" description="Még nem történt naplózott esemény." />
      ) : (
        <>
          <ol className="space-y-1.5">
            {items.map((entry) => {
              const action = ACTION_LABEL[entry.action] ?? { label: entry.action, tone: 'neutral' as BadgeTone };

              return (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-ink-800 bg-ink-900/40 px-4 py-3"
                >
                  <Badge tone={action.tone} className="shrink-0">
                    {action.label}
                  </Badge>

                  <span className="min-w-0 flex-1 truncate text-sm text-mist-200">
                    {entry.summary}
                  </span>

                  <span className="flex shrink-0 items-center gap-2">
                    {entry.actor && (
                      <Avatar
                        name={entry.actor.displayName}
                        src={entry.actor.avatarUrl}
                        size="xs"
                      />
                    )}
                    <span className="text-2xs text-mist-500">
                      {entry.actor?.displayName ?? entry.actorLabel ?? 'Rendszer'}
                    </span>
                  </span>

                  <time
                    dateTime={entry.createdAt.toISOString()}
                    className="nums w-36 shrink-0 text-right text-2xs text-mist-600"
                  >
                    {formatDateTime(entry.createdAt)}
                  </time>
                </li>
              );
            })}
          </ol>

          <Pagination
            page={meta.page ?? 1}
            totalPages={meta.totalPages ?? 1}
            total={meta.total}
            perPage={meta.perPage}
            buildHref={(page) => (page > 1 ? `/admin/naplo?page=${page}` : '/admin/naplo')}
          />
        </>
      )}
    </div>
  );
}
