import type { Metadata } from 'next';
import { ensurePermission } from '@/lib/auth/guards';
import { hasPermission } from '@/lib/auth/permissions';
import { toActor } from '@/lib/auth/session';
import { listRoles, listUsers } from '@/server/admin/users';
import { paginationSchema } from '@/lib/api/pagination';
import { userQuerySchema } from '@/lib/validation/schemas';
import { EmptyState } from '@/components/ui/feedback';
import { AdminUserTable } from '@/components/admin/user-table';

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
        }))}
        meta={meta}
        roles={roles.map((role) => ({ id: role.id, name: role.name, rank: role.rank }))}
        actorRank={actor.roleRank}
        actorId={actor.id}
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
