import { describe, expect, it } from 'vitest';
import { db } from '@/infrastructure/db';
import { deleteOwnAccount, exportAccount } from '@/features/users/account-data';
import { listCommentThreads } from '@/features/comments/queries';
import { SUPER_PERMISSION } from '@/shared/auth/permissions';
import * as make from './factories';

/**
 * Erasure and portability.
 *
 * The consequential assertion is the one about somebody *else's* reply. A
 * cascade from `comments.userId` would have deleted it, and nothing in the
 * application would have reported that a stranger's post disappeared because a
 * third party closed their account.
 */
describe('adatkezelési jogok', () => {
  it('az export mindent visszaad, ami a fiókhoz tartozik', async () => {
    const viewer = await make.user({ displayName: 'Exportáló' });
    const project = await make.project({ title: 'Exportált projekt' });
    const part = await make.episode(project.id);

    await db.comment.create({
      data: { userId: viewer.id, projectId: project.id, body: 'Egy hozzászólás.' },
    });
    await db.favorite.create({ data: { userId: viewer.id, projectId: project.id } });
    await db.rating.create({ data: { userId: viewer.id, projectId: project.id, score: 9 } });
    await db.watchProgress.create({
      data: { userId: viewer.id, episodeId: part.id, positionSec: 300 },
    });

    const dump = await exportAccount(viewer.id);

    expect(dump.fiok).toMatchObject({ megjelenitesiNev: 'Exportáló', email: viewer.email });
    expect(dump.hozzaszolasok).toHaveLength(1);
    expect(dump.kedvencek).toHaveLength(1);
    expect(dump.ertekelesek[0]?.score).toBe(9);
    expect(dump.nezesiElorehaladas[0]?.positionSec).toBe(300);
  });

  it('az export nem ad ki munkamenet-tokent', async () => {
    const viewer = await make.user();
    await db.session.create({
      data: {
        userId: viewer.id,
        tokenHash: 'titkos-hash-ertek',
        expiresAt: new Date(Date.now() + 86_400_000),
        absoluteEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    });

    const dump = await exportAccount(viewer.id);

    expect(dump.munkamenetek).toHaveLength(1);
    expect(JSON.stringify(dump)).not.toContain('titkos-hash-ertek');
  });

  it('a törlés elviszi a személyes sorokat', async () => {
    const viewer = await make.user();
    const project = await make.project();
    const part = await make.episode(project.id);

    await db.favorite.create({ data: { userId: viewer.id, projectId: project.id } });
    await db.rating.create({ data: { userId: viewer.id, projectId: project.id, score: 5 } });
    await db.watchProgress.create({
      data: { userId: viewer.id, episodeId: part.id, positionSec: 10 },
    });
    await db.notification.create({
      data: { userId: viewer.id, type: 'SYSTEM', title: 'Üdv', body: 'Szia' },
    });
    await db.session.create({
      data: {
        userId: viewer.id,
        tokenHash: 'x',
        expiresAt: new Date(Date.now() + 1000),
        absoluteEnd: new Date(Date.now() + 86_400_000),
      },
    });

    await deleteOwnAccount(viewer.id);

    expect(await db.user.findUnique({ where: { id: viewer.id } })).toBeNull();
    expect(await db.favorite.count({ where: { userId: viewer.id } })).toBe(0);
    expect(await db.rating.count({ where: { userId: viewer.id } })).toBe(0);
    expect(await db.watchProgress.count({ where: { userId: viewer.id } })).toBe(0);
    expect(await db.notification.count({ where: { userId: viewer.id } })).toBe(0);
    expect(await db.session.count({ where: { userId: viewer.id } })).toBe(0);
  });

  /**
   * The reason `comments.userId` became nullable.
   *
   * With the original `ON DELETE CASCADE`, deleting the account would delete
   * its comment, and the comment's cascade would take the reply with it — a
   * post written by a different person, removed without anybody being told.
   */
  it('a törlés nem viszi el mások válaszait', async () => {
    const leaving = await make.user({ displayName: 'Távozó' });
    const staying = await make.user({ displayName: 'Maradó' });
    const project = await make.project();

    const root = await db.comment.create({
      data: { userId: leaving.id, projectId: project.id, body: 'A gyökér hozzászólás.' },
    });
    await db.comment.create({
      data: {
        userId: staying.id,
        projectId: project.id,
        parentId: root.id,
        body: 'Válasz, amit valaki más írt.',
      },
    });

    await deleteOwnAccount(leaving.id);

    const { items } = await listCommentThreads({ projectId: project.id }, { page: 1, perPage: 20 });

    expect(items).toHaveLength(1);
    expect(items[0]?.body).toBe('A gyökér hozzászólás.');
    // A szerző levált, a szöveg megmaradt.
    expect(items[0]?.user).toBeNull();
    expect(items[0]?.replies.map((reply) => reply.body)).toEqual([
      'Válasz, amit valaki más írt.',
    ]);
    expect(items[0]?.replies[0]?.user?.displayName).toBe('Maradó');
  });

  it('az utolsó tulajdonosi fiók nem törölhető', async () => {
    const ownerRole = await db.role.create({
      data: {
        key: 'teszt-tulajdonos',
        name: 'Teszt tulajdonos',
        rank: 0,
        permissions: {
          create: {
            permission: {
              create: { key: SUPER_PERMISSION, group: 'Rendszer', description: 'Minden' },
            },
          },
        },
      },
    });
    const owner = await make.user({ roleId: ownerRole.id });

    await expect(deleteOwnAccount(owner.id)).rejects.toThrow(/egyetlen tulajdonosi/i);
    expect(await db.user.findUnique({ where: { id: owner.id } })).not.toBeNull();
  });

  it('a második tulajdonos már törölheti magát', async () => {
    const ownerRole = await db.role.create({
      data: {
        key: 'teszt-tulajdonos',
        name: 'Teszt tulajdonos',
        rank: 0,
        permissions: {
          create: {
            permission: {
              create: { key: SUPER_PERMISSION, group: 'Rendszer', description: 'Minden' },
            },
          },
        },
      },
    });
    const first = await make.user({ roleId: ownerRole.id });
    const second = await make.user({ roleId: ownerRole.id });

    await expect(deleteOwnAccount(second.id)).resolves.toBeDefined();
    expect(await db.user.findUnique({ where: { id: first.id } })).not.toBeNull();
  });
});
