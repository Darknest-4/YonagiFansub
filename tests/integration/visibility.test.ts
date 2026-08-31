import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { listCommentThreads } from '@/server/comments';
import { getProjectBySlug, listEpisodes, listProjects } from '@/server/projects';
import { search } from '@/server/search';
import * as make from './factories';

/**
 * Nothing unpublished, and nothing deleted, ever reaches a visitor.
 *
 * This is the single most valuable thing an integration suite can assert about
 * this codebase. Every public read path repeats the same two conditions —
 * `publishStatus: 'PUBLISHED'` and `deletedAt: null` — in its own `where`, and a
 * refactor that drops one of them from one query produces no type error, no
 * failing unit test, and no visible symptom until somebody's unfinished draft is
 * on the internet.
 *
 * So each test here creates the thing that must not be visible, asks a real read
 * path for it, and expects nothing back.
 */
describe('láthatóság', () => {
  it('a piszkozat projekt nincs a listában', async () => {
    await make.project({ slug: 'lathato', title: 'Látható' });
    await make.project({ slug: 'piszkozat', title: 'Piszkozat', publishStatus: 'DRAFT' });

    const { items, meta } = await listProjects({});

    expect(items.map((item) => item.slug)).toEqual(['lathato']);
    expect(meta.total).toBe(1);
  });

  it('a törölt projekt nincs a listában', async () => {
    await make.project({ slug: 'elo' });
    await make.project({ slug: 'torolt', deletedAt: new Date() });

    const { items } = await listProjects({});

    expect(items.map((item) => item.slug)).toEqual(['elo']);
  });

  it('a piszkozat projekt slug alapján sem érhető el', async () => {
    await make.project({ slug: 'rejtett', publishStatus: 'DRAFT' });

    // `null`, nem dobás: a hívó oldal ebből csinál 404-et.
    await expect(getProjectBySlug('rejtett')).resolves.toBeNull();
    // …de az adminnak igen, ugyanazon a függvényen keresztül.
    await expect(getProjectBySlug('rejtett', true)).resolves.toMatchObject({ slug: 'rejtett' });
  });

  it('a törölt epizód nincs a projekt epizódlistájában', async () => {
    const parent = await make.project();
    await make.episode(parent.id, { number: 1 });
    await make.episode(parent.id, { number: 2, deletedAt: new Date() });

    const items = await listEpisodes(parent.id);

    expect(items.map((item) => Number(item.number))).toEqual([1]);
  });

  it('a moderálásra váró hozzászólás nem látszik, a jóváhagyott igen', async () => {
    const author = await make.user();
    const target = await make.project();

    await db.comment.create({
      data: { userId: author.id, projectId: target.id, body: 'Jóváhagyva', status: 'PUBLISHED' },
    });
    await db.comment.create({
      data: { userId: author.id, projectId: target.id, body: 'Függőben', status: 'PENDING' },
    });
    await db.comment.create({
      data: { userId: author.id, projectId: target.id, body: 'Elrejtve', status: 'HIDDEN' },
    });

    const { items } = await listCommentThreads({ projectId: target.id }, { page: 1, perPage: 20 });

    expect(items.map((item) => item.body)).toEqual(['Jóváhagyva']);
  });

  it('a moderálásra váró válasz nem látszik a szülője alatt', async () => {
    const author = await make.user();
    const target = await make.project();

    const root = await db.comment.create({
      data: { userId: author.id, projectId: target.id, body: 'Gyökér' },
    });
    await db.comment.create({
      data: { userId: author.id, projectId: target.id, parentId: root.id, body: 'Látható válasz' },
    });
    await db.comment.create({
      data: {
        userId: author.id,
        projectId: target.id,
        parentId: root.id,
        body: 'Függő válasz',
        status: 'PENDING',
      },
    });

    const { items } = await listCommentThreads({ projectId: target.id }, { page: 1, perPage: 20 });

    expect(items).toHaveLength(1);
    expect(items[0]?.replies.map((reply) => reply.body)).toEqual(['Látható válasz']);
  });

  it('a keresés sem a piszkozatot, sem a töröltet nem adja vissza', async () => {
    await make.project({ title: 'Hoshizora Diary' });
    await make.project({ title: 'Hoshizora Titok', publishStatus: 'DRAFT' });
    await make.project({ title: 'Hoshizora Törölt', deletedAt: new Date() });
    await make.newsPost({ title: 'Hoshizora hír piszkozat', status: 'DRAFT' });

    const response = await search('Hoshizora');
    const titles = response.groups.flatMap((group) => group.results.map((result) => result.title));

    expect(titles).toEqual(['Hoshizora Diary']);
  });

  it('a jövőbeli megjelenésű hír még nem kereshető', async () => {
    const tomorrow = new Date(Date.now() + 86_400_000);
    await make.newsPost({ title: 'Nyaralas bejelentes', publishedAt: tomorrow });

    const response = await search('Nyaralas');

    expect(response.total).toBe(0);
  });
});
