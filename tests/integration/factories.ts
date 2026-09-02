import type { Prisma } from '@prisma/client';
import { db } from '@/infrastructure/db';

/**
 * Row builders for the integration suite.
 *
 * Each one fills in every column the schema requires and nothing else, so a test
 * body reads as the one thing it is actually about: `project({ publishStatus:
 * 'DRAFT' })` says "a draft project" and says nothing about slugs, because the
 * slug is never what the test is checking.
 *
 * Uniqueness comes from a counter rather than random values. A failure that
 * reproduces is worth more than one that looks realistic.
 */

let counter = 0;
const unique = () => `t${(counter += 1)}`;

export async function role(overrides: Partial<Prisma.RoleUncheckedCreateInput> = {}) {
  const id = unique();
  return db.role.create({
    data: { key: `role-${id}`, name: `Szerep ${id}`, rank: 100, ...overrides },
  });
}

export async function user(overrides: Partial<Prisma.UserUncheckedCreateInput> = {}) {
  const id = unique();
  const roleId = overrides.roleId ?? (await role()).id;

  return db.user.create({
    data: {
      email: `${id}@example.test`,
      username: `felhasznalo-${id}`,
      displayName: `Felhasználó ${id}`,
      // Never a real hash: nothing in these tests logs in, and generating one
      // per user would make the suite scrypt-bound for no benefit.
      passwordHash: 'nem-valodi-hash',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      ...overrides,
      roleId,
    },
  });
}

export async function project(overrides: Partial<Prisma.ProjectUncheckedCreateInput> = {}) {
  const id = unique();
  return db.project.create({
    data: {
      slug: `projekt-${id}`,
      title: `Projekt ${id}`,
      publishStatus: 'PUBLISHED',
      publishedAt: new Date(),
      ...overrides,
    },
  });
}

export async function episode(
  projectId: string,
  overrides: Partial<Prisma.EpisodeUncheckedCreateInput> = {},
) {
  return db.episode.create({
    data: { projectId, number: 1, status: 'RELEASED', ...overrides },
  });
}

export async function newsPost(overrides: Partial<Prisma.NewsPostUncheckedCreateInput> = {}) {
  const id = unique();
  return db.newsPost.create({
    data: {
      slug: `hir-${id}`,
      title: `Hír ${id}`,
      content: 'Tartalom.',
      status: 'PUBLISHED',
      publishedAt: new Date(),
      ...overrides,
    },
  });
}

export async function videoSource(
  episodeId: string,
  overrides: Partial<Prisma.VideoSourceUncheckedCreateInput> = {},
) {
  return db.videoSource.create({
    data: {
      episodeId,
      kind: 'HLS_PROXY',
      masterKey: 'video/teszt/master.m3u8',
      status: 'PUBLISHED',
      ...overrides,
    },
  });
}
