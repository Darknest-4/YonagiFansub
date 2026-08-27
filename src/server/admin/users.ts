import 'server-only';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { ConflictError, ForbiddenError, NotFoundError } from '@/lib/errors';
import { revokeAllSessions } from '@/lib/auth/session';
import {
  ALL_PERMISSIONS,
  OWNER_ROLE_KEY,
  canManageRole,
  type Permission,
} from '@/lib/auth/permissions';
import {
  paginationMeta,
  parseSort,
  toOrderBy,
  toSkipTake,
  type PaginationInput,
} from '@/lib/api/pagination';
import type { MutationContext } from '@/server/admin/context';
import { nullable } from '@/server/admin/context';
import type { RoleWriteInput, UserWriteInput } from '@/server/admin/types';

/**
 * User and role administration.
 *
 * This is the highest-risk surface in the application, so the rules are stated
 * once and enforced on every path:
 *
 *   1. **No upward reach.** An actor may only touch users and roles whose rank
 *      is strictly weaker than their own. Without this, an admin can promote
 *      themselves to owner in one request.
 *   2. **No self-demotion or self-lockout.** An actor cannot change their own
 *      role or status — that is the single most common way an instance ends up
 *      with zero administrators.
 *   3. **The last owner is protected.** The system always keeps at least one
 *      account that can grant permissions.
 */

const adminUserArgs = Prisma.validator<Prisma.UserDefaultArgs>()({
  select: {
    id: true,
    email: true,
    username: true,
    displayName: true,
    avatarUrl: true,
    bio: true,
    status: true,
    emailVerifiedAt: true,
    lastLoginAt: true,
    createdAt: true,
    deletedAt: true,
    role: { select: { id: true, key: true, name: true, rank: true, color: true } },
    _count: { select: { comments: true, favorites: true, sessions: true } },
  },
});

export type AdminUser = Prisma.UserGetPayload<typeof adminUserArgs>;

export interface UserListFilters {
  q?: string;
  status?: Prisma.UserWhereInput['status'];
  role?: string;
  sort?: string;
}

const USER_SORTS = ['createdAt', 'lastLoginAt', 'username', 'displayName'] as const;

export async function listUsers(filters: UserListFilters, pagination: PaginationInput) {
  const where: Prisma.UserWhereInput = { deletedAt: null };

  if (filters.status) where.status = filters.status;
  if (filters.role) where.role = { key: filters.role };
  if (filters.q) {
    where.OR = [
      { username: { contains: filters.q, mode: 'insensitive' } },
      { displayName: { contains: filters.q, mode: 'insensitive' } },
      { email: { contains: filters.q, mode: 'insensitive' } },
    ];
  }

  const sort = parseSort(filters.sort, USER_SORTS, { field: 'createdAt', direction: 'desc' });

  const [items, total] = await Promise.all([
    db.user.findMany({
      where,
      ...adminUserArgs,
      orderBy: [toOrderBy(sort), { id: 'desc' }],
      ...toSkipTake(pagination),
    }),
    db.user.count({ where }),
  ]);

  return { items, meta: paginationMeta(total, pagination) };
}

export async function getAdminUser(id: string): Promise<AdminUser> {
  const user = await db.user.findFirst({ where: { id }, ...adminUserArgs });
  if (!user) throw new NotFoundError('A felhasználó');
  return user;
}

export async function updateUser(
  id: string,
  input: UserWriteInput,
  context: MutationContext,
): Promise<AdminUser> {
  const target = await getAdminUser(id);

  if (target.id === context.actor.id) {
    throw new ForbiddenError('A saját szerepköröd és státuszod nem módosíthatod.');
  }

  // Rule 1, on the current role: you cannot edit someone at or above your rank.
  if (!canManageRole({ ...actorOf(context) }, target.role.rank)) {
    throw new ForbiddenError('Nem módosíthatsz nálad erősebb vagy azonos szintű fiókot.');
  }

  const nextRole = await db.role.findUnique({
    where: { id: input.roleId },
    select: { id: true, key: true, name: true, rank: true },
  });
  if (!nextRole) throw new NotFoundError('A szerepkör');

  // Rule 1, on the target role: and you cannot grant a role above your rank.
  if (!canManageRole({ ...actorOf(context) }, nextRole.rank)) {
    throw new ForbiddenError('Nem adhatsz olyan szerepkört, amely erősebb a sajátodnál.');
  }

  if (target.role.key === OWNER_ROLE_KEY && nextRole.key !== OWNER_ROLE_KEY) {
    await assertNotLastOwner(target.id);
  }

  const user = await db.user.update({
    where: { id },
    data: {
      displayName: input.displayName,
      status: input.status,
      roleId: input.roleId,
      bio: nullable(input.bio),
    },
    ...adminUserArgs,
  });

  // A suspended or banned account must lose its live sessions immediately;
  // otherwise the ban only takes effect when their cookie happens to expire.
  if (input.status === 'SUSPENDED' || input.status === 'BANNED') {
    await revokeAllSessions(id);
  }

  const roleChanged = target.role.id !== input.roleId;

  await context.audit({
    action: roleChanged ? 'PERMISSION_CHANGE' : 'UPDATE',
    entityType: 'User',
    entityId: id,
    summary: roleChanged
      ? `Szerepkör módosítva: @${target.username} — ${target.role.name} → ${nextRole.name}`
      : `Felhasználó módosítva: @${target.username}`,
    before: { status: target.status, role: target.role.key, displayName: target.displayName },
    after: { status: input.status, role: nextRole.key, displayName: input.displayName },
  });

  return user;
}

export async function softDeleteUser(id: string, context: MutationContext): Promise<void> {
  const target = await getAdminUser(id);

  if (target.id === context.actor.id) {
    throw new ForbiddenError('A saját fiókodat nem törölheted innen.');
  }
  if (!canManageRole({ ...actorOf(context) }, target.role.rank)) {
    throw new ForbiddenError('Nem törölhetsz nálad erősebb vagy azonos szintű fiókot.');
  }
  if (target.role.key === OWNER_ROLE_KEY) await assertNotLastOwner(target.id);

  await db.user.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      status: 'BANNED',
      // Free the unique handles so they can be reused, while keeping the row
      // (and therefore every foreign key that points at it) intact.
      email: `deleted+${id}@invalid.local`,
      username: `deleted_${id.slice(-8)}`,
    },
  });

  await revokeAllSessions(id);

  await context.audit({
    action: 'DELETE',
    entityType: 'User',
    entityId: id,
    summary: `Felhasználó törölve: @${target.username}`,
  });
}

async function assertNotLastOwner(excludingUserId: string): Promise<void> {
  const remaining = await db.user.count({
    where: {
      deletedAt: null,
      status: 'ACTIVE',
      role: { key: OWNER_ROLE_KEY },
      NOT: { id: excludingUserId },
    },
  });

  if (remaining === 0) {
    throw new ForbiddenError(
      'Ez az utolsó tulajdonosi fiók. Előbb nevezz ki másik tulajdonost.',
    );
  }
}

function actorOf(context: MutationContext) {
  return {
    id: context.actor.id,
    roleKey: context.actor.roleKey,
    roleRank: context.actor.roleRank,
    permissions: context.actor.permissions,
  };
}

// ── Roles ────────────────────────────────────────────────────────────────────

export async function listRoles() {
  return db.role.findMany({
    orderBy: { rank: 'asc' },
    select: {
      id: true,
      key: true,
      name: true,
      description: true,
      rank: true,
      color: true,
      isSystem: true,
      permissions: { select: { permission: { select: { key: true } } } },
      _count: { select: { users: true } },
    },
  });
}

export async function listPermissions() {
  return db.permission.findMany({
    orderBy: [{ group: 'asc' }, { key: 'asc' }],
    select: { id: true, key: true, group: true, description: true },
  });
}

export async function upsertRole(
  id: string | null,
  input: RoleWriteInput,
  context: MutationContext,
) {
  if (!canManageRole({ ...actorOf(context) }, input.rank)) {
    throw new ForbiddenError('Nem hozhatsz létre a sajátodnál erősebb szerepkört.');
  }

  // Silently dropping an unknown permission key would hide a typo forever.
  const unknown = input.permissionKeys.filter(
    (key) => !ALL_PERMISSIONS.includes(key as Permission),
  );
  if (unknown.length > 0) {
    throw new ConflictError(`Ismeretlen jogosultság: ${unknown.join(', ')}`);
  }

  const permissions = await db.permission.findMany({
    where: { key: { in: input.permissionKeys } },
    select: { id: true },
  });

  if (id) {
    const current = await db.role.findUnique({
      where: { id },
      select: { id: true, key: true, name: true, rank: true, isSystem: true },
    });
    if (!current) throw new NotFoundError('A szerepkör');

    if (current.key === OWNER_ROLE_KEY) {
      throw new ForbiddenError('A tulajdonosi szerepkör nem módosítható.');
    }
    if (!canManageRole({ ...actorOf(context) }, current.rank)) {
      throw new ForbiddenError('Nem módosíthatsz nálad erősebb szerepkört.');
    }

    const role = await db.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      return tx.role.update({
        where: { id },
        data: {
          // A system role's key is referenced from code; only its label moves.
          ...(current.isSystem ? {} : { key: input.key }),
          name: input.name,
          description: nullable(input.description),
          rank: input.rank,
          color: nullable(input.color),
          permissions: {
            create: permissions.map((permission) => ({ permissionId: permission.id })),
          },
        },
      });
    });

    await context.audit({
      action: 'PERMISSION_CHANGE',
      entityType: 'Role',
      entityId: id,
      summary: `Szerepkör módosítva: ${input.name}`,
      after: { permissions: input.permissionKeys, rank: input.rank },
    });

    return role;
  }

  const existing = await db.role.findUnique({ where: { key: input.key }, select: { id: true } });
  if (existing) throw new ConflictError('Ez a szerepkör-kulcs már létezik.');

  const role = await db.role.create({
    data: {
      key: input.key,
      name: input.name,
      description: nullable(input.description),
      rank: input.rank,
      color: nullable(input.color),
      permissions: { create: permissions.map((permission) => ({ permissionId: permission.id })) },
    },
  });

  await context.audit({
    action: 'PERMISSION_CHANGE',
    entityType: 'Role',
    entityId: role.id,
    summary: `Szerepkör létrehozva: ${input.name}`,
    after: { permissions: input.permissionKeys, rank: input.rank },
  });

  return role;
}

export async function deleteRole(id: string, context: MutationContext): Promise<void> {
  const role = await db.role.findUnique({
    where: { id },
    select: { id: true, key: true, name: true, rank: true, isSystem: true, _count: { select: { users: true } } },
  });
  if (!role) throw new NotFoundError('A szerepkör');

  if (role.isSystem) throw new ForbiddenError('Rendszerszerepkör nem törölhető.');
  if (role._count.users > 0) {
    throw new ConflictError(
      `Ehhez a szerepkörhöz még ${role._count.users} felhasználó tartozik. Előbb sorold át őket.`,
    );
  }
  if (!canManageRole({ ...actorOf(context) }, role.rank)) {
    throw new ForbiddenError('Nem törölhetsz nálad erősebb szerepkört.');
  }

  await db.role.delete({ where: { id } });

  await context.audit({
    action: 'PERMISSION_CHANGE',
    entityType: 'Role',
    entityId: id,
    summary: `Szerepkör törölve: ${role.name}`,
  });
}
