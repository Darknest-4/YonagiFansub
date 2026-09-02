import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_KEY,
  OWNER_ROLE_KEY,
  SYSTEM_ROLES,
  canAccessAdmin,
  canManageRole,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  type Actor,
} from '@/shared/auth/permissions';

/**
 * Authorisation rules.
 *
 * Every one of these assertions corresponds to a way an instance could be taken
 * over: a member reaching an admin endpoint, an admin promoting themselves to
 * owner, a wildcard leaking to a role that should not have it.
 */

function actor(overrides: Partial<Actor> = {}): Actor {
  return {
    id: 'user_1',
    roleKey: 'member',
    roleRank: 100,
    permissions: [],
    ...overrides,
  };
}

describe('hasPermission', () => {
  it('grants only what the actor holds', () => {
    const staff = actor({ roleKey: 'staff', roleRank: 50, permissions: ['project:write'] });

    expect(hasPermission(staff, 'project:write')).toBe(true);
    expect(hasPermission(staff, 'project:delete')).toBe(false);
    expect(hasPermission(staff, 'settings:write')).toBe(false);
  });

  it('treats the wildcard as everything', () => {
    const owner = actor({ roleKey: 'owner', roleRank: 0, permissions: ['*'] });

    for (const permission of ALL_PERMISSIONS) {
      expect(hasPermission(owner, permission)).toBe(true);
    }
  });

  it('denies an anonymous actor', () => {
    expect(hasPermission(null, 'project:read')).toBe(false);
    expect(hasPermission(undefined, 'admin:access')).toBe(false);
    expect(canAccessAdmin(null)).toBe(false);
  });
});

describe('hasAnyPermission / hasAllPermissions', () => {
  it('distinguishes any from all', () => {
    const editor = actor({ permissions: ['news:write', 'news:publish'] });

    expect(hasAnyPermission(editor, ['news:write', 'user:delete'])).toBe(true);
    expect(hasAllPermissions(editor, ['news:write', 'user:delete'])).toBe(false);
    expect(hasAllPermissions(editor, ['news:write', 'news:publish'])).toBe(true);
  });
});

describe('canManageRole – privilege escalation guard', () => {
  it('allows acting only on strictly weaker roles', () => {
    const admin = actor({ roleKey: 'admin', roleRank: 10, permissions: ['user:write'] });

    expect(canManageRole(admin, 100)).toBe(true); // member
    expect(canManageRole(admin, 30)).toBe(true); // editor
    expect(canManageRole(admin, 10)).toBe(false); // another admin: equal rank
    expect(canManageRole(admin, 0)).toBe(false); // owner
  });

  it('lets the owner manage every role', () => {
    const owner = actor({ roleKey: 'owner', roleRank: 0, permissions: ['*'] });
    expect(canManageRole(owner, 0)).toBe(true);
    expect(canManageRole(owner, 100)).toBe(true);
  });

  it('denies an anonymous actor', () => {
    expect(canManageRole(null, 100)).toBe(false);
  });
});

describe('system role definitions', () => {
  it('gives the wildcard to the owner and to nobody else', () => {
    for (const role of SYSTEM_ROLES) {
      if (role.key === OWNER_ROLE_KEY) {
        expect(role.permissions).toBe('*');
      } else {
        expect(role.permissions).not.toBe('*');
      }
    }
  });

  it('gives the default role no permissions at all', () => {
    const member = SYSTEM_ROLES.find((role) => role.key === DEFAULT_ROLE_KEY);
    expect(member).toBeDefined();
    expect(member!.permissions).toEqual([]);
    expect(canAccessAdmin(actor({ permissions: [] }))).toBe(false);
  });

  it('only grants admin panel access to roles that need it', () => {
    for (const role of SYSTEM_ROLES) {
      if (role.permissions === '*') continue;

      const hasAdminAccess = role.permissions.includes('admin:access');
      const hasOtherAdminWork = role.permissions.some((permission) => permission !== 'admin:access');

      // A role either does admin work and can open the panel, or neither.
      expect(hasAdminAccess).toBe(hasOtherAdminWork && role.key !== DEFAULT_ROLE_KEY);
    }
  });

  it('references only declared permissions', () => {
    for (const role of SYSTEM_ROLES) {
      if (role.permissions === '*') continue;
      for (const permission of role.permissions) {
        expect(ALL_PERMISSIONS).toContain(permission);
      }
    }
  });

  it('assigns every role a unique, ordered rank', () => {
    const ranks = SYSTEM_ROLES.map((role) => role.rank);
    expect(new Set(ranks).size).toBe(ranks.length);

    const owner = SYSTEM_ROLES.find((role) => role.key === OWNER_ROLE_KEY)!;
    expect(Math.min(...ranks)).toBe(owner.rank);
  });
});
