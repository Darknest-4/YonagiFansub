import { describe, expect, it } from 'vitest';
import { db } from '@/infrastructure/db';
import { checkProvider, checkSource, setMaintenance } from '@/features/video/health-service';
import { buildPlaybackManifest } from '@/features/video/playback-service';
import * as make from './factories';

/**
 * Az állapotrendszer valódi adatbázis ellen.
 *
 * A besorolás szabályait egy egységteszt fedi; itt az a kérdés, hogy a mentés
 * és a visszaolvasás összeér-e, és hogy az állapot **tényleg beleszól-e** a
 * lejátszásba. Az utóbbi a lényeg: egy állapottábla, amit a feloldó nem olvas,
 * pontosan annyit ér, mint a semmi.
 *
 * Kimenő hálózati kérés nincs bennük. Az ellenőrzések olyan forrásokra futnak,
 * amiknél az adapter már a hálózat előtt eldönti a választ — hiányzó kulcs,
 * hiányzó azonosító, hiányzó szolgáltató —, mert egy tesztnek nem szabad egy
 * idegen szolgáltató elérhetőségétől függenie.
 */

async function episodeWithProject() {
  const project = await make.project();
  const episode = await make.episode(project.id, { number: 1, status: 'RELEASED' });
  return { project, episode };
}

describe('a forrás ellenőrzésének mentése', () => {
  it('hiányzó tárolási kulcsnál elérhetetlen, és a hibaszámláló nő', async () => {
    const { episode } = await episodeWithProject();
    const source = await make.videoSource(episode.id, { masterKey: null });

    const first = await checkSource(source.id);
    expect(first.previous).toBe('UNKNOWN');

    const row = await db.videoSourceHealth.findUnique({ where: { sourceId: source.id } });
    expect(row?.failureCount).toBe(1);
    expect(row?.lastFailureAt).toBeInstanceOf(Date);
    expect(row?.lastSuccessAt).toBeNull();
    expect(row?.lastError).toContain('tárolási kulcs');
  });

  /*
    Négy kör kell a halotthoz. Ez a fokozatosság a lényege: egyetlen hibából
    lehet hálózati zökkenő, és a büntetés — kiesés a lejátszási láncból — sokkal
    drágább, mint amit megelőzne.
  */
  it('négy sikertelen kör után lesz halott, előbb nem', async () => {
    const { episode } = await episodeWithProject();
    const source = await make.videoSource(episode.id, { masterKey: null });

    const seen: string[] = [];
    for (let round = 0; round < 4; round += 1) {
      seen.push((await checkSource(source.id)).current);
    }

    expect(seen).toEqual(['UNKNOWN', 'DEGRADED', 'DEGRADED', 'OFFLINE']);
  });

  it('ismeretlen forrásra hibát dob, nem hallgat', async () => {
    await expect(checkSource('cmnemletezik0000000000000')).rejects.toThrow();
  });
});

describe('az állapot beleszól a lejátszásba', () => {
  /*
    Ez az egyetlen teszt, ami a teljes kört méri: ellenőrzés → mentés →
    feloldás. Ha ez elbukik, az állapottábla dísz.
  */
  it('a halottá vált forrás eltűnik a lejátszási láncból', async () => {
    const { episode } = await episodeWithProject();
    const rossz = await make.videoSource(episode.id, {
      masterKey: null,
      resolution: 'FHD_1080P',
    });
    await make.videoSource(episode.id, { resolution: 'HD_720P' });

    const elotte = await buildPlaybackManifest({
      episodeId: episode.id,
      quality: '1080p',
      userId: null,
    });
    expect(elotte.chain.map((c) => c.sourceId)).toContain(rossz.id);

    for (let round = 0; round < 4; round += 1) await checkSource(rossz.id);

    const utana = await buildPlaybackManifest({
      episodeId: episode.id,
      quality: '1080p',
      userId: null,
    });
    expect(utana.chain.map((c) => c.sourceId)).not.toContain(rossz.id);
    expect(utana.resolvedQuality).toBe('720p');
  });
});

describe('kézi karbantartás', () => {
  it('kivétele azonnal hat a lejátszásra', async () => {
    const { episode } = await episodeWithProject();
    const source = await make.videoSource(episode.id);

    await setMaintenance({ sourceId: source.id }, true);

    const manifest = await buildPlaybackManifest({
      episodeId: episode.id,
      quality: 'AUTO',
      userId: null,
    });
    expect(manifest.chain).toEqual([]);
  });

  /*
    Amit ember vett ki, azt az automatika nem teheti vissza — különben a
    „kikapcsoltam, mert épp cserélem a fájlt” reggelre magától visszakapcsolna.
  */
  it('az ellenőrzés nem hozza vissza a karbantartásból', async () => {
    const { episode } = await episodeWithProject();
    const source = await make.videoSource(episode.id, { masterKey: null });

    await setMaintenance({ sourceId: source.id }, true);
    const outcome = await checkSource(source.id);

    expect(outcome.current).toBe('MAINTENANCE');
  });

  it('kézzel visszakapcsolva ismeretlenből indul, nem találgat', async () => {
    const { episode } = await episodeWithProject();
    const source = await make.videoSource(episode.id);

    await setMaintenance({ sourceId: source.id }, true);
    await setMaintenance({ sourceId: source.id }, false);

    const row = await db.videoSourceHealth.findUnique({ where: { sourceId: source.id } });
    expect(row?.status).toBe('UNKNOWN');
    expect(row?.isMaintenance).toBe(false);
  });
});

describe('a szolgáltató mintavételes ellenőrzése', () => {
  it('forrás nélkül ismeretlen — nem élő és nem halott', async () => {
    const provider = await make.videoProvider();
    const outcome = await checkProvider(provider.id);

    expect(outcome.current).toBe('UNKNOWN');
    expect(outcome.detail).toContain('mintavétel');
  });

  /*
    Egyetlen működő forrás elég az élőhöz. A fordítottja — „mind működjön" —
    azt jelentené, hogy egy törölt fájl az egész szolgáltatót halottnak
    minősíti, és vele minden más forrását kiveszi a láncból.
  */
  it('minden mintavett forrás bukása után lesz halott a szolgáltató', async () => {
    const { episode } = await episodeWithProject();
    const provider = await make.videoProvider({ embedTemplate: null });

    // Sablon nélkül a beágyazás-adapter már a hálózat előtt elutasít.
    await make.videoSource(episode.id, {
      kind: 'EMBED',
      masterKey: null,
      providerId: provider.id,
      externalId: 'a',
    });

    const seen: string[] = [];
    for (let round = 0; round < 4; round += 1) {
      seen.push((await checkProvider(provider.id)).current);
    }

    expect(seen.at(-1)).toBe('OFFLINE');
  });

  it('a halott szolgáltató minden forrását kiveszi a láncból', async () => {
    const { episode } = await episodeWithProject();
    const provider = await make.videoProvider({ embedTemplate: null });
    await make.videoSource(episode.id, {
      kind: 'EMBED',
      masterKey: null,
      providerId: provider.id,
      externalId: 'a',
    });

    for (let round = 0; round < 4; round += 1) await checkProvider(provider.id);

    const manifest = await buildPlaybackManifest({
      episodeId: episode.id,
      quality: 'AUTO',
      userId: null,
    });
    expect(manifest.chain).toEqual([]);
  });
});

describe('az állapotsor alakja', () => {
  it('egy forráshoz pontosan egy sor tartozik, ismételt ellenőrzés után is', async () => {
    const { episode } = await episodeWithProject();
    const source = await make.videoSource(episode.id, { masterKey: null });

    await checkSource(source.id);
    await checkSource(source.id);
    await checkSource(source.id);

    const rows = await db.videoSourceHealth.findMany({ where: { sourceId: source.id } });
    expect(rows).toHaveLength(1);
  });

  /*
    Az adatbázis-megszorítás a végső védelem: kód nélkül sem keletkezhet olyan
    sor, ami egyszerre tartozik forráshoz és szolgáltatóhoz, vagy egyikhez sem.
  */
  it('nem hozható létre sor két célponttal', async () => {
    const { episode } = await episodeWithProject();
    const source = await make.videoSource(episode.id);
    const provider = await make.videoProvider();

    await expect(
      db.videoSourceHealth.create({
        data: { sourceId: source.id, providerId: provider.id },
      }),
    ).rejects.toThrow();
  });

  it('sem célpont nélkül', async () => {
    await expect(db.videoSourceHealth.create({ data: {} })).rejects.toThrow();
  });
});
