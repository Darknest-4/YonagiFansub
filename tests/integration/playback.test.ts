import { describe, expect, it } from 'vitest';
import { db } from '@/infrastructure/db';
import { buildPlaybackManifest } from '@/features/video/playback-service';
import * as make from './factories';

/**
 * A lejátszási terv valódi adatbázis ellen.
 *
 * A feloldó szabályait már egy egységteszt lefedi; ez nem azt méri újra. Itt az
 * a kérdés, hogy a **lekérdezés** tényleg azokat a jeleket adja-e át, amikre a
 * szabályok épülnek — és hogy a láthatóság minden szinten érvényesül-e. A két
 * hiba, ami csak itt lakhat: nem publikált tartalom kiszivárgása, és a válaszba
 * kerülő olyan mező, aminek nem szabadna kimennie.
 */

async function scenario(episodes = 3) {
  const project = await make.project();
  const rows = [];
  for (let n = 1; n <= episodes; n += 1) {
    rows.push(await make.episode(project.id, { number: n, status: 'RELEASED', durationSec: 1400 }));
  }
  return { project, episodes: rows };
}

describe('láthatóság', () => {
  it('nem publikált projekt epizódja nem játszható', async () => {
    const hidden = await make.project({ publishStatus: 'DRAFT' });
    const episode = await make.episode(hidden.id, { status: 'RELEASED' });
    await make.videoSource(episode.id);

    await expect(
      buildPlaybackManifest({ episodeId: episode.id, quality: 'AUTO', userId: null }),
    ).rejects.toThrow();
  });

  it('meg nem jelent epizód nem játszható', async () => {
    const { project } = await scenario(0);
    const episode = await make.episode(project.id, { number: 1, status: 'IN_PROGRESS' });
    await make.videoSource(episode.id);

    await expect(
      buildPlaybackManifest({ episodeId: episode.id, quality: 'AUTO', userId: null }),
    ).rejects.toThrow();
  });

  it('a nem publikált forrás nem kerül a láncba', async () => {
    const { episodes } = await scenario(1);
    await make.videoSource(episodes[0]!.id, { status: 'DRAFT' });
    await make.videoSource(episodes[0]!.id, { status: 'PUBLISHED', resolution: 'HD_720P' });

    const manifest = await buildPlaybackManifest({
      episodeId: episodes[0]!.id,
      quality: 'AUTO',
      userId: null,
    });

    expect(manifest.chain).toHaveLength(1);
    expect(manifest.chain[0]?.quality).toBe('720p');
  });

  it('a törölt forrás sem', async () => {
    const { episodes } = await scenario(1);
    const source = await make.videoSource(episodes[0]!.id);
    await db.videoSource.update({ where: { id: source.id }, data: { deletedAt: new Date() } });

    const manifest = await buildPlaybackManifest({
      episodeId: episodes[0]!.id,
      quality: 'AUTO',
      userId: null,
    });

    expect(manifest.chain).toEqual([]);
    expect(manifest.availableQualities).toEqual([]);
  });
});

describe('mi kerül ki a válaszba', () => {
  /*
    A legfontosabb biztonsági állítás ezen a végponton. Ha egy tárolási kulcs
    vagy egy beágyazási cím belekerülne a válaszba, a token-alapú kiszolgálás
    egész pontja elveszne: elég lenne egyszer lekérni a tervet, és onnantól a
    forrás közvetlenül hívható.
  */
  it('nincs benne forrás-URL, tárolási kulcs vagy külső azonosító', async () => {
    const { episodes } = await scenario(1);
    const provider = await make.videoProvider();
    await make.videoSource(episodes[0]!.id, { masterKey: 'video/titkos-kulcs/master.m3u8' });
    await make.videoSource(episodes[0]!.id, {
      kind: 'EMBED',
      masterKey: null,
      providerId: provider.id,
      externalId: 'kulso-azonosito-123',
      resolution: 'HD_720P',
    });

    const manifest = await buildPlaybackManifest({
      episodeId: episodes[0]!.id,
      quality: 'AUTO',
      userId: null,
    });
    const serialised = JSON.stringify(manifest);

    expect(serialised).not.toContain('titkos-kulcs');
    expect(serialised).not.toContain('kulso-azonosito-123');
    expect(serialised).not.toContain('pelda.hu');
    expect(serialised).not.toContain('master.m3u8');
  });

  it('a feliratsáv a saját végpontján át hivatkozik, tárolási kulcs nélkül', async () => {
    const { episodes } = await scenario(1);
    const track = await make.subtitleTrack(episodes[0]!.id, {
      storageKey: 'subs/nagyon-titkos.ass',
    });

    const manifest = await buildPlaybackManifest({
      episodeId: episodes[0]!.id,
      quality: 'AUTO',
      userId: null,
    });

    expect(manifest.subtitles[0]?.url).toBe(`/api/v1/subtitles/${track.id}`);
    expect(JSON.stringify(manifest)).not.toContain('nagyon-titkos');
  });
});

describe('a lánc összeállítása valódi sorokból', () => {
  it('a szolgáltatói prioritás az adatbázisból jön', async () => {
    const { episodes } = await scenario(1);
    const gyors = await make.videoProvider({ name: 'Gyors', priority: 10 });
    const lassu = await make.videoProvider({ name: 'Lassú', priority: 900 });

    await make.videoSource(episodes[0]!.id, {
      kind: 'EMBED',
      masterKey: null,
      providerId: lassu.id,
      externalId: 'a',
      resolution: 'FHD_1080P',
    });
    await make.videoSource(episodes[0]!.id, {
      kind: 'EMBED',
      masterKey: null,
      providerId: gyors.id,
      externalId: 'b',
      resolution: 'FHD_1080P',
    });

    const manifest = await buildPlaybackManifest({
      episodeId: episodes[0]!.id,
      quality: '1080p',
      userId: null,
    });

    expect(manifest.chain.map((c) => c.providerName)).toEqual(['Gyors', 'Lassú']);
  });

  it('a saját tárhely megelőzi a külső szolgáltatókat', async () => {
    const { episodes } = await scenario(1);
    const provider = await make.videoProvider({ name: 'Külső', priority: 1 });

    await make.videoSource(episodes[0]!.id, {
      kind: 'EMBED',
      masterKey: null,
      providerId: provider.id,
      externalId: 'a',
      resolution: 'FHD_1080P',
    });
    await make.videoSource(episodes[0]!.id, { resolution: 'FHD_1080P' });

    const manifest = await buildPlaybackManifest({
      episodeId: episodes[0]!.id,
      quality: '1080p',
      userId: null,
    });

    // A saját forrásnak nincs szolgáltatója, tehát a prioritása 0 — a
    // legelőrébb sorolt külső szolgáltató sem előzheti meg.
    expect(manifest.chain[0]?.providerName).toBeNull();
  });

  it('a halott forrás állapota az adatbázisból érvényesül', async () => {
    const { episodes } = await scenario(1);
    const beteg = await make.videoSource(episodes[0]!.id, { resolution: 'FHD_1080P' });
    await make.videoSource(episodes[0]!.id, { resolution: 'HD_720P' });
    await make.health({ sourceId: beteg.id }, { status: 'OFFLINE', failureCount: 20 });

    const manifest = await buildPlaybackManifest({
      episodeId: episodes[0]!.id,
      quality: '1080p',
      userId: null,
    });

    expect(manifest.chain.map((c) => c.sourceId)).not.toContain(beteg.id);
    expect(manifest.availableQualities).toEqual(['720p']);
    expect(manifest.resolvedQuality).toBe('720p');
  });

  it('a szolgáltató leállása a forrásait is kiveszi', async () => {
    const { episodes } = await scenario(1);
    const provider = await make.videoProvider();
    await make.health({ providerId: provider.id }, { status: 'OFFLINE' });
    await make.videoSource(episodes[0]!.id, {
      kind: 'EMBED',
      masterKey: null,
      providerId: provider.id,
      externalId: 'a',
    });

    const manifest = await buildPlaybackManifest({
      episodeId: episodes[0]!.id,
      quality: 'AUTO',
      userId: null,
    });

    expect(manifest.chain).toEqual([]);
  });

  it('a belépéshez kötött forrás vendégnek nem jár, belépve igen', async () => {
    const { episodes } = await scenario(1);
    const viewer = await make.user();
    await make.videoSource(episodes[0]!.id, { requiresAuth: true });

    const vendeg = await buildPlaybackManifest({
      episodeId: episodes[0]!.id,
      quality: 'AUTO',
      userId: null,
    });
    const belepve = await buildPlaybackManifest({
      episodeId: episodes[0]!.id,
      quality: 'AUTO',
      userId: viewer.id,
    });

    expect(vendeg.chain).toEqual([]);
    expect(belepve.chain).toHaveLength(1);
  });
});

describe('a lejátszáshoz tartozó kísérőadatok', () => {
  it('a szomszédos részek a megjelentek közül jönnek', async () => {
    const { project, episodes } = await scenario(3);
    // A negyedik rész még készül — nem lehet „következő”.
    await make.episode(project.id, { number: 4, status: 'IN_PROGRESS' });

    const manifest = await buildPlaybackManifest({
      episodeId: episodes[1]!.id,
      quality: 'AUTO',
      userId: null,
    });

    expect(manifest.previousEpisode?.number).toBe('1');
    expect(manifest.nextEpisode?.number).toBe('3');

    const utolso = await buildPlaybackManifest({
      episodeId: episodes[2]!.id,
      quality: 'AUTO',
      userId: null,
    });
    expect(utolso.nextEpisode).toBeNull();
  });

  it('a főcím-időzítés átjön', async () => {
    const { episodes } = await scenario(1);
    await db.episode.update({
      where: { id: episodes[0]!.id },
      data: { introStartSec: 60, introEndSec: 150, outroStartSec: 1320, outroEndSec: 1400 },
    });

    const manifest = await buildPlaybackManifest({
      episodeId: episodes[0]!.id,
      quality: 'AUTO',
      userId: null,
    });

    expect(manifest.markers).toEqual({
      introStartSec: 60,
      introEndSec: 150,
      outroStartSec: 1320,
      outroEndSec: 1400,
    });
  });

  it('a mentett állás folytatásként jön vissza', async () => {
    const { episodes } = await scenario(1);
    const viewer = await make.user();
    await db.watchProgress.create({
      data: { userId: viewer.id, episodeId: episodes[0]!.id, positionSec: 822 },
    });

    const manifest = await buildPlaybackManifest({
      episodeId: episodes[0]!.id,
      quality: 'AUTO',
      userId: viewer.id,
    });

    expect(manifest.resumeAtSec).toBe(822);
  });

  /*
    Aki végignézte a részt és újra megnyitja, elölről akarja. A „folytatás
    23:41-től" ott pont az utolsó pillanatra dobná, ahonnan nincs tovább.
  */
  it('a befejezett részt nem ajánlja folytatásra', async () => {
    const { episodes } = await scenario(1);
    const viewer = await make.user();
    await db.watchProgress.create({
      data: {
        userId: viewer.id,
        episodeId: episodes[0]!.id,
        positionSec: 1390,
        completed: true,
      },
    });

    const manifest = await buildPlaybackManifest({
      episodeId: episodes[0]!.id,
      quality: 'AUTO',
      userId: viewer.id,
    });

    expect(manifest.resumeAtSec).toBeNull();
  });

  it('vendégnek nincs folytatás', async () => {
    const { episodes } = await scenario(1);
    const manifest = await buildPlaybackManifest({
      episodeId: episodes[0]!.id,
      quality: 'AUTO',
      userId: null,
    });
    expect(manifest.resumeAtSec).toBeNull();
  });

  it('csak a publikált feliratsávok jönnek, alapértelmezett elöl', async () => {
    const { episodes } = await scenario(1);
    await make.subtitleTrack(episodes[0]!.id, { label: 'Piszkozat', status: 'DRAFT' });
    await make.subtitleTrack(episodes[0]!.id, { label: 'Második', sortOrder: 2 });
    await make.subtitleTrack(episodes[0]!.id, { label: 'Alapértelmezett', isDefault: true, sortOrder: 9 });

    const manifest = await buildPlaybackManifest({
      episodeId: episodes[0]!.id,
      quality: 'AUTO',
      userId: null,
    });

    expect(manifest.subtitles.map((s) => s.label)).toEqual(['Alapértelmezett', 'Második']);
  });
});

describe('a kliens által jelzett kudarcok', () => {
  it('a már elbukott forrás kimarad a következő tervből', async () => {
    const { episodes } = await scenario(1);
    const elso = await make.videoSource(episodes[0]!.id, { sortOrder: 1 });
    const masodik = await make.videoSource(episodes[0]!.id, { sortOrder: 2 });

    const manifest = await buildPlaybackManifest({
      episodeId: episodes[0]!.id,
      quality: 'AUTO',
      userId: null,
      excludeSourceIds: [elso.id],
    });

    expect(manifest.chain.map((c) => c.sourceId)).toEqual([masodik.id]);
  });
});
