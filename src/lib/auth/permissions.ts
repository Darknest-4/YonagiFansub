/**
 * Permission catalogue.
 *
 * Permissions are *declared* here (so TypeScript can check every call site) and
 * *stored* in the database (so the matrix can be re-tuned from the admin panel
 * without a deploy). The seed reconciles the two: keys added here appear in the
 * next seed run; keys removed here are pruned.
 *
 * Naming: `<domain>:<verb>`. `write` covers create + update; `delete` is always
 * separate because it is the destructive one.
 */

export const PERMISSIONS = {
  // Catalogue
  'project:read': { group: 'Projektek', description: 'Piszkozat projektek megtekintése' },
  'project:write': { group: 'Projektek', description: 'Projektek létrehozása és szerkesztése' },
  'project:publish': { group: 'Projektek', description: 'Projektek publikálása és archiválása' },
  'project:delete': { group: 'Projektek', description: 'Projektek törlése' },

  'episode:write': { group: 'Epizódok', description: 'Epizódok és munkafolyamat kezelése' },
  'episode:delete': { group: 'Epizódok', description: 'Epizódok törlése' },

  'release:write': { group: 'Kiadások', description: 'Kiadások és letöltési linkek kezelése' },
  'release:publish': { group: 'Kiadások', description: 'Kiadások publikálása' },
  'release:delete': { group: 'Kiadások', description: 'Kiadások törlése' },

  // Editorial
  'news:write': { group: 'Hírek', description: 'Hírek írása és szerkesztése' },
  'news:publish': { group: 'Hírek', description: 'Hírek publikálása' },
  'news:delete': { group: 'Hírek', description: 'Hírek törlése' },

  'faq:write': { group: 'Tartalom', description: 'GYIK bejegyzések kezelése' },
  'media:write': { group: 'Tartalom', description: 'Médiatár feltöltés és kezelés' },
  'media:delete': { group: 'Tartalom', description: 'Médiafájlok törlése' },

  // Team
  'team:write': { group: 'Csapat', description: 'Csapattagok és pozíciók kezelése' },
  'team:delete': { group: 'Csapat', description: 'Csapattagok törlése' },

  // Community
  'comment:moderate': { group: 'Közösség', description: 'Hozzászólások moderálása' },
  'contact:read': { group: 'Közösség', description: 'Beérkezett üzenetek olvasása' },
  'contact:write': { group: 'Közösség', description: 'Üzenetek kezelése és megválaszolása' },

  // Administration
  'user:read': { group: 'Felhasználók', description: 'Felhasználói fiókok listázása' },
  'user:write': { group: 'Felhasználók', description: 'Fiókok szerkesztése, tiltása' },
  'user:delete': { group: 'Felhasználók', description: 'Fiókok törlése' },
  'role:manage': { group: 'Felhasználók', description: 'Szerepkörök és jogosultságok kezelése' },

  'settings:read': { group: 'Rendszer', description: 'Oldalbeállítások megtekintése' },
  'settings:write': { group: 'Rendszer', description: 'Oldalbeállítások módosítása' },
  'audit:read': { group: 'Rendszer', description: 'Audit napló megtekintése' },
  'stats:read': { group: 'Rendszer', description: 'Statisztikák és riportok megtekintése' },
  'admin:access': { group: 'Rendszer', description: 'Belépés az adminisztrációs felületre' },
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const PERMISSION_GROUPS = [...new Set(ALL_PERMISSIONS.map((p) => PERMISSIONS[p].group))];

/** Wildcard granted to the owner role. Never assign this to anyone else. */
export const SUPER_PERMISSION = '*' as const;

export interface RoleDefinition {
  key: string;
  name: string;
  description: string;
  /** Lower rank = more powerful. Prevents privilege escalation between staff. */
  rank: number;
  color: string;
  permissions: Permission[] | typeof SUPER_PERMISSION;
}

const STAFF_PERMISSIONS: Permission[] = [
  'admin:access',
  'project:read',
  'project:write',
  'episode:write',
  'release:write',
  'media:write',
  'stats:read',
];

const EDITOR_PERMISSIONS: Permission[] = [
  ...STAFF_PERMISSIONS,
  'project:publish',
  'release:publish',
  'news:write',
  'news:publish',
  'faq:write',
  'team:write',
];

const MODERATOR_PERMISSIONS: Permission[] = [
  'admin:access',
  'project:read',
  'comment:moderate',
  'contact:read',
  'contact:write',
  'user:read',
  'stats:read',
];

const ADMIN_PERMISSIONS: Permission[] = [
  ...new Set<Permission>([
    ...EDITOR_PERMISSIONS,
    ...MODERATOR_PERMISSIONS,
    'project:delete',
    'episode:delete',
    'release:delete',
    'news:delete',
    'media:delete',
    'team:delete',
    'user:write',
    'settings:read',
    'settings:write',
    'audit:read',
  ]),
];

/** System roles created by the seed. Ranks leave gaps for custom roles. */
export const SYSTEM_ROLES: RoleDefinition[] = [
  {
    key: 'owner',
    name: 'Tulajdonos',
    description: 'Teljes hozzáférés a rendszer minden funkciójához.',
    rank: 0,
    color: '#4cd8ff',
    permissions: SUPER_PERMISSION,
  },
  {
    key: 'admin',
    name: 'Adminisztrátor',
    description: 'Teljes tartalom- és felhasználókezelés, a szerepkörök kivételével.',
    rank: 10,
    color: '#9d7bff',
    permissions: ADMIN_PERMISSIONS,
  },
  {
    key: 'editor',
    name: 'Szerkesztő',
    description: 'Projektek, kiadások és hírek publikálása.',
    rank: 30,
    color: '#ffc76b',
    permissions: EDITOR_PERMISSIONS,
  },
  {
    key: 'staff',
    name: 'Stáb',
    description: 'Munkafolyamat és kiadások szerkesztése publikálás nélkül.',
    rank: 50,
    color: '#5eead4',
    permissions: STAFF_PERMISSIONS,
  },
  {
    key: 'moderator',
    name: 'Moderátor',
    description: 'Hozzászólások és beérkező üzenetek kezelése.',
    rank: 60,
    color: '#f472b6',
    permissions: MODERATOR_PERMISSIONS,
  },
  {
    key: 'member',
    name: 'Tag',
    description: 'Alapértelmezett szerepkör regisztrált felhasználóknak.',
    rank: 100,
    color: '#94a3b8',
    permissions: [],
  },
];

export const DEFAULT_ROLE_KEY = 'member';
export const OWNER_ROLE_KEY = 'owner';

/** A lightweight actor shape – everything authorisation needs, nothing more. */
export interface Actor {
  id: string;
  roleKey: string;
  roleRank: number;
  permissions: readonly string[];
}

export function hasPermission(actor: Actor | null | undefined, permission: Permission): boolean {
  if (!actor) return false;
  return actor.permissions.includes(SUPER_PERMISSION) || actor.permissions.includes(permission);
}

export function hasAnyPermission(
  actor: Actor | null | undefined,
  permissions: readonly Permission[],
): boolean {
  return permissions.some((permission) => hasPermission(actor, permission));
}

export function hasAllPermissions(
  actor: Actor | null | undefined,
  permissions: readonly Permission[],
): boolean {
  return permissions.every((permission) => hasPermission(actor, permission));
}

/**
 * Privilege-escalation guard: an actor may only act on roles strictly weaker
 * than their own. Without this, an admin could grant themselves owner.
 */
export function canManageRole(actor: Actor | null | undefined, targetRank: number): boolean {
  if (!actor) return false;
  if (actor.permissions.includes(SUPER_PERMISSION)) return true;
  return actor.roleRank < targetRank;
}

/** Can this actor open the admin panel at all? */
export function canAccessAdmin(actor: Actor | null | undefined): boolean {
  return hasPermission(actor, 'admin:access');
}
