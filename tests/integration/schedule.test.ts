import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { loadSchedule, loadUndatedOngoing } from '@/server/schedule';
import * as make from './factories';

const days = (n: number) => new Date(Date.now() + n * 86_400_000);

/** Flattens the grouped days back to a list, for assertions about membership. */
async function scheduled() {
  const grouped = await loadSchedule();
  return grouped.flatMap((day) => day.episodes);
}

/**
 * The schedule is a *view*, not a list somebody maintains.
 *
 * Everything below is about what that view refuses to include. A calendar that
 * quietly shows a finished series, a draft, or a cancelled episode is worse
 * than no calendar: it is a page the team stops trusting and then stops
 * checking.
 */
describe('adásnaptár', () => {
  it('csak a futó projektek részei kerülnek bele', async () => {
    const ongoing = await make.project({ title: 'Fut', status: 'ONGOING' });
    const finished = await make.project({ title: 'Befejezett', status: 'COMPLETED' });
    const announced = await make.project({ title: 'Bejelentve', status: 'ANNOUNCED' });

    await make.episode(ongoing.id, { number: 1, airedAt: days(2) });
    await make.episode(finished.id, { number: 1, airedAt: days(2) });
    await make.episode(announced.id, { number: 1, airedAt: days(2) });

    const list = await scheduled();

    expect(list.map((entry) => entry.project.title)).toEqual(['Fut']);
  });

  it('a nem publikált projekt nem jelenik meg', async () => {
    const draft = await make.project({ status: 'ONGOING', publishStatus: 'DRAFT' });
    await make.episode(draft.id, { number: 1, airedAt: days(2) });

    expect(await scheduled()).toEqual([]);
  });

  it('a törölt projekt és a törölt epizód sem', async () => {
    const removed = await make.project({ status: 'ONGOING', deletedAt: new Date() });
    await make.episode(removed.id, { number: 1, airedAt: days(2) });

    const live = await make.project({ status: 'ONGOING' });
    await make.episode(live.id, { number: 1, airedAt: days(2), deletedAt: new Date() });

    expect(await scheduled()).toEqual([]);
  });

  it('a lemondott epizód kimarad', async () => {
    const project = await make.project({ status: 'ONGOING' });
    await make.episode(project.id, { number: 1, airedAt: days(2), status: 'CANCELLED' });
    await make.episode(project.id, { number: 2, airedAt: days(3) });

    const list = await scheduled();

    expect(list.map((entry) => entry.number)).toEqual([2]);
  });

  it('az ablakon kívüli dátumok kimaradnak', async () => {
    const project = await make.project({ status: 'ONGOING' });
    await make.episode(project.id, { number: 1, airedAt: days(-30) });
    await make.episode(project.id, { number: 2, airedAt: days(-2) });
    await make.episode(project.id, { number: 3, airedAt: days(60) });

    const list = await scheduled();

    expect(list.map((entry) => entry.number)).toEqual([2]);
  });

  it('a napok növekvő sorrendben jönnek', async () => {
    const project = await make.project({ status: 'ONGOING' });
    await make.episode(project.id, { number: 2, airedAt: days(5) });
    await make.episode(project.id, { number: 1, airedAt: days(1) });

    const grouped = await loadSchedule();

    expect(grouped.map((day) => day.date)).toEqual([...grouped.map((d) => d.date)].sort());
    expect(grouped[0]?.episodes[0]?.number).toBe(1);
  });

  /**
   * The one piece of information on the page that is ours rather than the
   * broadcaster's: whether our subtitle exists yet.
   *
   * It used to be counted from published release rows hanging off the episode.
   * That was a second record of the same fact, and the two could disagree; the
   * episode's own status is the single answer now.
   */
  it('a megjelent epizód feliratosnak számít, a készülő nem', async () => {
    const project = await make.project({ status: 'ONGOING' });
    await make.episode(project.id, { number: 1, airedAt: days(-1), status: 'RELEASED' });
    await make.episode(project.id, { number: 2, airedAt: days(1), status: 'IN_PROGRESS' });

    const list = await scheduled();
    const byNumber = new Map(list.map((entry) => [entry.number, entry.subtitled]));

    expect(byNumber.get(1)).toBe(true);
    expect(byNumber.get(2)).toBe(false);
  });

  describe('dátum nélküli futó projektek', () => {
    it('a datált részű projekt nem kerül ide', async () => {
      const project = await make.project({ status: 'ONGOING' });
      await make.episode(project.id, { number: 1, airedAt: days(3) });

      expect(await loadUndatedOngoing()).toEqual([]);
    });

    it('a dátum nélküli futó projekt igen', async () => {
      const project = await make.project({ title: 'Ismeretlen adásrend', status: 'ONGOING' });
      await make.episode(project.id, { number: 1, airedAt: null });

      const list = await loadUndatedOngoing();

      expect(list.map((entry) => entry.title)).toEqual(['Ismeretlen adásrend']);
    });

    it('a befejezett projekt akkor sem, ha nincs datált része', async () => {
      await make.project({ status: 'COMPLETED' });

      expect(await loadUndatedOngoing()).toEqual([]);
    });
  });
});
