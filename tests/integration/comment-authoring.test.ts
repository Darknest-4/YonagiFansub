import { describe, expect, it } from 'vitest';
import { db } from '@/infrastructure/db';
import { deleteOwnComment, editOwnComment, listCommentThreads } from '@/features/comments/queries';
import * as make from './factories';

const page = { page: 1, perPage: 20 };

async function comment(userId: string, projectId: string, body: string, parentId?: string) {
  return db.comment.create({
    data: { userId, projectId, body, ...(parentId ? { parentId } : {}) },
  });
}

describe('saját hozzászólás kezelése', () => {
  it('a szerző javíthatja a saját szövegét, és ez látszik is', async () => {
    const author = await make.user();
    const project = await make.project();
    const row = await comment(author.id, project.id, 'Elgépeslt szöveg.');

    await editOwnComment(row.id, author.id, 'Elgépelt szöveg.', false);

    const { items } = await listCommentThreads({ projectId: project.id }, page);

    expect(items[0]?.body).toBe('Elgépelt szöveg.');
    expect(items[0]?.editedAt).not.toBeNull();
  });

  it('más hozzászólását nem lehet szerkeszteni', async () => {
    const [author, stranger] = await Promise.all([make.user(), make.user()]);
    const project = await make.project();
    const row = await comment(author.id, project.id, 'Az enyém.');

    await expect(editOwnComment(row.id, stranger.id, 'Átírva', false)).rejects.toThrow();

    const untouched = await db.comment.findUniqueOrThrow({ where: { id: row.id } });
    expect(untouched.body).toBe('Az enyém.');
  });

  it('az ablakon túl a szerkesztés elutasított', async () => {
    const author = await make.user();
    const project = await make.project();
    const row = await comment(author.id, project.id, 'Régi.');

    await db.comment.update({
      where: { id: row.id },
      data: { createdAt: new Date(Date.now() - 20 * 60_000) },
    });

    await expect(editOwnComment(row.id, author.id, 'Új', false)).rejects.toThrow(/15 perc/);
  });

  /**
   * The moderation queue is trivially bypassed without this: post something
   * harmless, wait for approval, then edit it into whatever you meant to post.
   */
  it('jóváhagyásos üzemmódban a szerkesztés visszateszi a sorba', async () => {
    const author = await make.user();
    const project = await make.project();
    const row = await comment(author.id, project.id, 'Ártalmatlan.');

    const edited = await editOwnComment(row.id, author.id, 'Módosított.', true);

    expect(edited.status).toBe('PENDING');
    const { items } = await listCommentThreads({ projectId: project.id }, page);
    expect(items).toHaveLength(0);
  });

  it('a moderátor által elrejtett hozzászólást a szerző nem írhatja át', async () => {
    const author = await make.user();
    const project = await make.project();
    const row = await comment(author.id, project.id, 'Kifogásolt.');
    await db.comment.update({ where: { id: row.id }, data: { status: 'HIDDEN' } });

    await expect(editOwnComment(row.id, author.id, 'Ártatlan.', false)).rejects.toThrow();
  });

  it('a válasz nélküli hozzászólás törlésre eltűnik', async () => {
    const author = await make.user();
    const project = await make.project();
    const row = await comment(author.id, project.id, 'Egyedülálló.');

    await expect(deleteOwnComment(row.id, author.id)).resolves.toEqual({ tombstoned: false });

    expect(await db.comment.findUnique({ where: { id: row.id } })).toBeNull();
    const { items } = await listCommentThreads({ projectId: project.id }, page);
    expect(items).toHaveLength(0);
  });

  /**
   * The whole reason a tombstone exists: deleting the row would cascade into
   * the reply, removing a post somebody else wrote.
   */
  it('a válaszokkal rendelkező hozzászólás helye megmarad, a válasz is', async () => {
    const [author, other] = await Promise.all([make.user(), make.user()]);
    const project = await make.project();
    const root = await comment(author.id, project.id, 'A gyökér.');
    await comment(other.id, project.id, 'Idegen válasza.', root.id);

    await expect(deleteOwnComment(root.id, author.id)).resolves.toEqual({ tombstoned: true });

    const { items } = await listCommentThreads({ projectId: project.id }, page);

    expect(items).toHaveLength(1);
    expect(items[0]?.deleted).toBe(true);
    // Sem a szöveg, sem a szerző nem kerül ki a válaszon keresztül.
    expect(items[0]?.body).toBe('');
    expect(items[0]?.user).toBeNull();
    expect(items[0]?.replies.map((reply) => reply.body)).toEqual(['Idegen válasza.']);
  });

  it('más hozzászólását nem lehet törölni', async () => {
    const [author, stranger] = await Promise.all([make.user(), make.user()]);
    const project = await make.project();
    const row = await comment(author.id, project.id, 'Marad.');

    await expect(deleteOwnComment(row.id, stranger.id)).rejects.toThrow();
    expect(await db.comment.findUnique({ where: { id: row.id } })).not.toBeNull();
  });
});
