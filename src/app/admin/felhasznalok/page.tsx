import type { Metadata } from 'next';
import { ensurePermission } from '@/shared/auth/guards';
import { canManageRole, hasPermission } from '@/shared/auth/permissions';
import { toActor } from '@/shared/auth/session';
import { listRoles, listUsers } from '@/features/users/admin-service';
import { paginationSchema } from '@/shared/api/pagination';
import { userQuerySchema } from '@/features/users/schemas';
import { EmptyState } from '@/shared/ui/feedback';
import { AdminUserTable } from '@/features/users/components/user-table';

export const metadata: Metadata = { title: 'Felhasználók' };
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminUsersPage({ searchParams }: { searchParams: SearchParams }) {
  const actorUser = await ensurePermission('user:read', '/admin/felhasznalok');
  const actor = toActor(actorUser);

  const raw = await searchParams;
  const flat = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );

  const parsed = userQuerySchema.safeParse(flat);
  const filters = parsed.success ? parsed.data : userQuerySchema.parse({});
  const pagination = paginationSchema.parse({ page: filters.page, perPage: 25 });

  const [{ items, meta }, roles] = await Promise.all([
    listUsers(
      { q: filters.q, status: filters.status, role: filters.role, sort: filters.sort },
      pagination,
    ),
    listRoles(),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl">Felhasználók</h1>
        <p className="mt-1 text-sm text-content-muted">
          Fiókok, szerepkörök és státuszok. Saját magadat és a nálad erősebb fiókokat nem
          módosíthatod.
        </p>
      </header>

      <AdminUserTable
        rows={items.map((user) => ({
          id: user.id,
          email: user.email,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          bio: user.bio,
          status: user.status,
          emailVerified: Boolean(user.emailVerifiedAt),
          lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
          createdAt: user.createdAt.toISOString(),
          roleId: user.role.id,
          roleName: user.role.name,
          roleRank: user.role.rank,
          roleColor: user.role.color,
          /*
            Editability is decided here, with the same `canManageRole` the write
            path uses, and sent down as a fact. The client previously re-derived
            it from ranks alone and so disagreed with the server for anyone
            holding the super permission — the UI refused edits the API would
            have accepted. One rule, evaluated once.
          */
          isSelf: user.id === actor.id,
          editable: user.id !== actor.id && canManageRole(actor, user.role.rank),
        }))}
        meta={meta}
        // Same rule again, for the roles this actor is allowed to grant.
        roles={roles
          .filter((role) => canManageRole(actor, role.rank))
          .map((role) => ({ id: role.id, name: role.name, rank: role.rank }))}
        canWrite={hasPermission(actor, 'user:write')}
        emptyState={
          <EmptyState
            title="Nincs találat"
            description="Módosítsd a keresést vagy a szűrőket."
            compact
          />
        }
      />
    </div>
  );
}
