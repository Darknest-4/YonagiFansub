import type { Metadata } from 'next';
import { ensurePermission } from '@/shared/auth/guards';
import { hasPermission } from '@/shared/auth/permissions';
import { toActor } from '@/shared/auth/session';
import { listPermissions, listRoles } from '@/features/users/admin-service';
import { RoleMatrix } from '@/features/users/components/role-matrix';

export const metadata: Metadata = { title: 'Szerepkörök' };
export const dynamic = 'force-dynamic';

export default async function AdminRolesPage() {
  const user = await ensurePermission('role:manage', '/admin/szerepkorok');
  const actor = toActor(user);

  const [roles, permissions] = await Promise.all([listRoles(), listPermissions()]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl">Szerepkörök és jogosultságok</h1>
        <p className="mt-1 max-w-2xl text-sm text-content-muted">
          A jogosultságok adatként élnek, nem kódban — így deploy nélkül hangolható, ki mit
          tehet. Csak a sajátodnál gyengébb szerepköröket szerkesztheted.
        </p>
      </header>

      <RoleMatrix
        roles={roles.map((role) => ({
          id: role.id,
          key: role.key,
          name: role.name,
          description: role.description,
          rank: role.rank,
          color: role.color,
          isSystem: role.isSystem,
          userCount: role._count.users,
          permissionKeys: role.permissions.map((entry) => entry.permission.key),
        }))}
        permissions={permissions.map((permission) => ({
          key: permission.key,
          group: permission.group,
          description: permission.description,
        }))}
        actorRank={actor.roleRank}
        canManage={hasPermission(actor, 'role:manage')}
      />
    </div>
  );
}
