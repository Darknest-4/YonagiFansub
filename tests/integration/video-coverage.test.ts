import { describe, expect, it } from 'vitest';
import {
  getVideoCoverageSummary,
  listCoverageGaps,
  listProjectCoverage,
} from '@/features/video/coverage';
import * as make from './factories';

/**
 * Video source coverage.
 *
 * The whole module is relation filters — "released episodes with no published
 * source" — assembled from three aggregates that have to agree with each other.
 * There is no pure function in it to unit-test, and an off-by-one between those
 * aggregates would show up as a plausible-looking wrong number rather than an
 * error, which is exactly the kind of bug that survives review.
 */
describe('videóforrás-lefedettség', () => {
  it('csak a kiadott, forrás nélküli epizódokat jelenti hiánynak', async () => {
    const parent = await make.project({ title: 'Teszt sorozat' });

    const covered = await make.episode(parent.id, { number: 1 });
    await make.videoSource(covered.id);

    const missing = await make.episode(parent.id, { number: 2 });
    await make.episode(parent.id, { number: 3, status: 'IN_PROGRESS' });
    await make.episode(parent.id, { number: 4, deletedAt: new Date() });

    const gaps = await listCoverageGaps();

    expect(gaps.map((gap) => gap.episodeId)).toEqual([missing.id]);
    expect(gaps[0]).toMatchObject({ number: 2, projectTitle: 'Teszt sorozat', draftSources: 0 });
  });

  it('a piszkozat forrás nem tesz lefedetté, de megjelenik a soron', async () => {
    const parent = await make.project();
    const part = await make.episode(parent.id, { number: 1 });
    await make.videoSource(part.id, { status: 'DRAFT' });

    const gaps = await listCoverageGaps();

    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.draftSources).toBe(1);
  });

  it('a törölt forrás nem számít sem lefedettségnek, sem piszkozatnak', async () => {
    const parent = await make.project();
    const part = await make.episode(parent.id, { number: 1 });
    await make.videoSource(part.id, { deletedAt: new Date() });

    const gaps = await listCoverageGaps();

    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.draftSources).toBe(0);
  });

  it('a rejtett projekt epizódja nem jelenik meg hiányként', async () => {
    const hidden = await make.project({ deletedAt: new Date() });
    await make.episode(hidden.id, { number: 1 });

    expect(await listCoverageGaps()).toEqual([]);
  });

  it('az összesítés fajtánként bontja a publikált forrásokat', async () => {
    const parent = await make.project();
    const first = await make.episode(parent.id, { number: 1 });
    const second = await make.episode(parent.id, { number: 2 });
    const third = await make.episode(parent.id, { number: 3 });

    await make.videoSource(first.id, { kind: 'HLS_PROXY' });
    await make.videoSource(first.id, { kind: 'DIRECT_FILE', sortOrder: 1 });
    await make.videoSource(second.id, { kind: 'EMBED', externalId: 'abc' });
    await make.videoSource(third.id, { status: 'DRAFT' });

    const summary = await getVideoCoverageSummary();

    expect(summary).toEqual({
      byKind: { HLS_PROXY: 1, DIRECT_FILE: 1, EMBED: 1 },
      unpublished: 1,
      releasedEpisodes: 3,
      coveredEpisodes: 2,
    });
  });

  it('a projektenkénti bontás a legtöbb hiánnyal kezd, és a számai összeadódnak', async () => {
    const worse = await make.project({ title: 'Sok hiány' });
    for (const number of [1, 2, 3]) await make.episode(worse.id, { number });

    const better = await make.project({ title: 'Kevés hiány' });
    const one = await make.episode(better.id, { number: 1 });
    await make.episode(better.id, { number: 2 });
    await make.videoSource(one.id);
    await make.videoSource(one.id, { sortOrder: 1 });

    const rows = await listProjectCoverage();

    expect(rows.map((row) => row.title)).toEqual(['Sok hiány', 'Kevés hiány']);
    expect(rows[0]).toMatchObject({ released: 3, covered: 0, sources: 0 });
    // Két forrás egy epizódon: a forrásszám kettő, a lefedettség egy.
    expect(rows[1]).toMatchObject({ released: 2, covered: 1, sources: 2 });
  });

  it('a kiadott epizód nélküli projekt nem szerepel a bontásban', async () => {
    const parent = await make.project();
    await make.episode(parent.id, { number: 1, status: 'PLANNED' });

    expect(await listProjectCoverage()).toEqual([]);
  });
});
