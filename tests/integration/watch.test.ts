import { describe, expect, it } from 'vitest';
import { db } from '@/infrastructure/db';
import {
  clearRating,
  getContinueWatching,
  getProjectProgress,
  getRatingSummary,
  recordProgress,
  setRating,
} from '@/features/watch/service';
import * as make from './factories';

/**
 * Watch progress and ratings, against a real database.
 *
 * `nextPosition` is already pinned by a unit test, and that is not the same
 * thing: the guard it implements only protects anything if `recordProgress`
 * reads the current row, applies it, and writes the result inside one
 * transaction. That is the part a pure function cannot demonstrate, and it is
 * the part that was wrong once already.
 */
describe('nézési előrehaladás', () => {
  it('a nulláról induló jelentés nem törli a meglévő pozíciót', async () => {
    const viewer = await make.user();
    const parent = await make.project();
    const part = await make.episode(parent.id, { durationSec: 1440 });

    await recordProgress({ userId: viewer.id, episodeId: part.id, positionSec: 620 });
    // Egy oldalfrissítés: a lejátszó 0-t jelent, mielőtt visszaállna.
    await recordProgress({ userId: viewer.id, episodeId: part.id, positionSec: 0 });

    const stored = await db.watchProgress.findUniqueOrThrow({
      where: { userId_episodeId: { userId: viewer.id, episodeId: part.id } },
    });

    expect(stored.positionSec).toBe(620);
  });

  it('a szándékos visszatekerés elmentődik', async () => {
    const viewer = await make.user();
    const parent = await make.project();
    const part = await make.episode(parent.id);

    await recordProgress({ userId: viewer.id, episodeId: part.id, positionSec: 900 });
    await recordProgress({ userId: viewer.id, episodeId: part.id, positionSec: 300 });

    const progress = await getProjectProgress(viewer.id, parent.id);

    expect(progress.get(part.id)?.positionSec).toBe(300);
  });

  it('a hossz 90%-a felett megnézettnek számít, és az is marad', async () => {
    const viewer = await make.user();
    const parent = await make.project();
    const part = await make.episode(parent.id, { durationSec: 1000 });

    await recordProgress({
      userId: viewer.id,
      episodeId: part.id,
      positionSec: 950,
      durationSec: 1000,
    });
    // Újranézés elölről: a pozíció visszaáll, a "megnézett" nem.
    await recordProgress({
      userId: viewer.id,
      episodeId: part.id,
      positionSec: 120,
      durationSec: 1000,
    });

    const progress = await getProjectProgress(viewer.id, parent.id);

    expect(progress.get(part.id)).toMatchObject({ positionSec: 120, completed: true });
  });

  it('a folytatás listája kihagyja a befejezetteket és a rejtett epizódokat', async () => {
    const viewer = await make.user();
    const visible = await make.project();
    const hidden = await make.project({ deletedAt: new Date() });

    const open = await make.episode(visible.id, { number: 1, durationSec: 1000 });
    const finished = await make.episode(visible.id, { number: 2, durationSec: 1000 });
    const planned = await make.episode(visible.id, { number: 3, status: 'PLANNED' });
    const orphan = await make.episode(hidden.id, { number: 1 });

    await recordProgress({ userId: viewer.id, episodeId: open.id, positionSec: 400 });
    await recordProgress({
      userId: viewer.id,
      episodeId: finished.id,
      positionSec: 990,
      durationSec: 1000,
    });
    await recordProgress({ userId: viewer.id, episodeId: planned.id, positionSec: 400 });
    await recordProgress({ userId: viewer.id, episodeId: orphan.id, positionSec: 400 });

    const resume = await getContinueWatching(viewer.id);

    expect(resume.map((entry) => entry.episode.id)).toEqual([open.id]);
  });

  it('két néző előrehaladása független', async () => {
    const [first, second] = await Promise.all([make.user(), make.user()]);
    const parent = await make.project();
    const part = await make.episode(parent.id);

    await recordProgress({ userId: first.id, episodeId: part.id, positionSec: 100 });
    await recordProgress({ userId: second.id, episodeId: part.id, positionSec: 800 });

    const [a, b] = await Promise.all([
      getProjectProgress(first.id, parent.id),
      getProjectProgress(second.id, parent.id),
    ]);

    expect(a.get(part.id)?.positionSec).toBe(100);
    expect(b.get(part.id)?.positionSec).toBe(800);
  });
});

describe('értékelés', () => {
  it('az átlag és a darabszám a valódi szavazatokból jön', async () => {
    const [a, b, c] = await Promise.all([make.user(), make.user(), make.user()]);
    const target = await make.project();

    await setRating(a.id, target.id, 8);
    await setRating(b.id, target.id, 10);
    await setRating(c.id, target.id, 6);

    const summary = await getRatingSummary(target.id, a.id);

    expect(summary).toEqual({ average: 8, count: 3, mine: 8 });
  });

  it('az ismételt szavazás felülírja a régit, nem ad hozzá egyet', async () => {
    const viewer = await make.user();
    const target = await make.project();

    await setRating(viewer.id, target.id, 3);
    const summary = await setRating(viewer.id, target.id, 9);

    expect(summary).toEqual({ average: 9, count: 1, mine: 9 });
  });

  it('a visszavonás eltünteti a szavazatot', async () => {
    const [a, b] = await Promise.all([make.user(), make.user()]);
    const target = await make.project();

    await setRating(a.id, target.id, 4);
    await setRating(b.id, target.id, 8);
    const summary = await clearRating(a.id, target.id);

    expect(summary).toEqual({ average: 8, count: 1, mine: null });
  });

  it('a nem létező szavazat visszavonása nem hiba', async () => {
    const viewer = await make.user();
    const target = await make.project();

    await expect(clearRating(viewer.id, target.id)).resolves.toEqual({
      average: null,
      count: 0,
      mine: null,
    });
  });

  it('a bejelentkezés nélküli olvasás nem szivárogtat saját pontszámot', async () => {
    const viewer = await make.user();
    const target = await make.project();
    await setRating(viewer.id, target.id, 7);

    expect(await getRatingSummary(target.id)).toEqual({ average: 7, count: 1, mine: null });
  });
});
