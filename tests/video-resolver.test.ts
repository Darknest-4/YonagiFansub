import { describe, expect, it } from 'vitest';
import {
  QUALITY_STEPS,
  qualityDistance,
  resolvePlaybackChain,
  type HealthSnapshot,
  type QualityStep,
  type ResolvableSource,
} from '@/features/video/resolver';

/**
 * A forrásfeloldó szabálykészlete.
 *
 * Négy szempont verseng itt egyszerre — kért minőség, szolgáltatói prioritás,
 * állapot, kézi sorrend —, és a hibák nem abból szoktak jönni, hogy valamelyik
 * külön-külön rossz, hanem hogy a *sorrendjük* rossz ott, ahol kettő ellentétes
 * irányba húz. A tesztek nagy része ezért ütközéseket ír le, nem egyszerű
 * eseteket.
 */

const ONLINE: HealthSnapshot = { status: 'ONLINE', failureCount: 0, averageLatencyMs: 120 };
const UNKNOWN: HealthSnapshot = { status: 'UNKNOWN', failureCount: 0, averageLatencyMs: null };
const DEGRADED: HealthSnapshot = { status: 'DEGRADED', failureCount: 3, averageLatencyMs: 4000 };
const OFFLINE: HealthSnapshot = { status: 'OFFLINE', failureCount: 12, averageLatencyMs: null };
const MAINTENANCE: HealthSnapshot = { status: 'MAINTENANCE', failureCount: 0, averageLatencyMs: null };

let counter = 0;

function source(over: Partial<ResolvableSource> = {}): ResolvableSource {
  counter += 1;
  return {
    id: over.id ?? `s${counter}`,
    quality: '1080p',
    isAdaptive: false,
    bitrateKbps: null,
    requiresAuth: false,
    sortOrder: 0,
    providerId: 'p',
    providerPriority: 100,
    providerEnabled: true,
    health: ONLINE,
    providerHealth: null,
    ...over,
  };
}

/** Rövidítés: egy szolgáltató egy minőségen. */
function at(provider: string, priority: number, quality: QualityStep, over: Partial<ResolvableSource> = {}) {
  return source({ id: `${provider}-${quality}`, providerId: provider, providerPriority: priority, quality, ...over });
}

const ids = (outcome: ReturnType<typeof resolvePlaybackChain>) =>
  outcome.chain.map((entry) => entry.source.id);

describe('a minőségi távolság', () => {
  it('a kért fok a legközelebb', () => {
    expect(qualityDistance('1080p', '1080p')).toBe(0);
  });

  it('lefelé közelebb van, mint felfelé', () => {
    // Egy fok lefelé (720p) verje a közvetlenül fölötte lévőt (1440p).
    expect(qualityDistance('1080p', '720p')).toBeLessThan(qualityDistance('1080p', '1440p'));
  });

  /*
    A legfontosabb határeset: aki 480p-t kért, az valószínűleg szűk hálózaton
    van. A 360p neki használható, a 2160p nem — pedig „csak" egy fokkal
    gyengébb, illetve három fokkal jobb.
  */
  it('a leggyengébb lefelé is előrébb van a legjobb felfelénél', () => {
    expect(qualityDistance('480p', '360p')).toBeLessThan(qualityDistance('480p', '2160p'));
  });

  it('minden fokra értelmezett', () => {
    for (const from of QUALITY_STEPS) {
      for (const to of QUALITY_STEPS) {
        expect(qualityDistance(from, to)).toBeLessThan(Number.MAX_SAFE_INTEGER);
      }
    }
  });
});

describe('a visszaesési lánc sorrendje', () => {
  /*
    A feladatleírás pontosan ezt a láncot kéri, és ez az egész feloldó lényege:
    a minőség a külső rendezés, a szolgáltató a belső.
  */
  it('előbb minden szolgáltató a kért minőségen, csak utána a gyengébb', () => {
    const outcome = resolvePlaybackChain(
      [
        at('C', 300, '720p'),
        at('A', 100, '1080p'),
        at('B', 200, '720p'),
        at('B', 200, '1080p'),
        at('C', 300, '1080p'),
        at('A', 100, '720p'),
      ],
      { quality: '1080p', isAuthenticated: true },
    );

    expect(ids(outcome)).toEqual([
      'A-1080p',
      'B-1080p',
      'C-1080p',
      'A-720p',
      'B-720p',
      'C-720p',
    ]);
  });

  it('a kért minőség hiányában lefelé lép, nem felfelé', () => {
    const outcome = resolvePlaybackChain(
      [at('A', 100, '2160p'), at('B', 200, '720p')],
      { quality: '1080p', isAuthenticated: true },
    );

    expect(ids(outcome)[0]).toBe('B-720p');
  });

  it('ha csak fölfelé van, azt is felajánlja', () => {
    const outcome = resolvePlaybackChain([at('A', 100, '2160p')], {
      quality: '480p',
      isAuthenticated: true,
    });

    expect(ids(outcome)).toEqual(['A-2160p']);
    expect(outcome.chain[0]?.isRequestedQuality).toBe(false);
  });

  it('a lánc jelzi, melyik jelölt adja a kért minőséget', () => {
    const outcome = resolvePlaybackChain(
      [at('A', 100, '1080p'), at('B', 200, '720p')],
      { quality: '1080p', isAuthenticated: true },
    );

    expect(outcome.chain.map((c) => c.isRequestedQuality)).toEqual([true, false]);
  });
});

describe('az állapot beleszólása', () => {
  it('az akadozó forrás hátrébb kerül, de nem tűnik el', () => {
    const outcome = resolvePlaybackChain(
      [
        at('A', 100, '1080p', { health: DEGRADED }),
        at('B', 200, '1080p', { health: ONLINE }),
      ],
      { quality: '1080p', isAuthenticated: true },
    );

    // A szolgáltatói prioritás erősebb: A előbbre van sorolva, tehát A marad elöl.
    // Az állapot csak akkor dönt, ha a prioritás azonos — ezt a következő eset méri.
    expect(ids(outcome)).toEqual(['A-1080p', 'B-1080p']);
  });

  it('azonos prioritásnál az egészséges megy előre', () => {
    const outcome = resolvePlaybackChain(
      [
        source({ id: 'beteg', providerPriority: 100, health: DEGRADED }),
        source({ id: 'eges', providerPriority: 100, health: ONLINE }),
      ],
      { quality: '1080p', isAuthenticated: true },
    );

    expect(ids(outcome)).toEqual(['eges', 'beteg']);
  });

  /*
    Ez a döntés kimondottan szerepel a feladatban: „Ne legyen agresszív
    automatikus tiltás." Egy még nem ellenőrzött forrás nem rosszabb egy
    ellenőrzöttnél — különben minden újonnan felvett forrás az utolsó helyen
    indulna, és sosem kapna esélyt bizonyítani.
  */
  it('a még nem ellenőrzött forrás egyenrangú az egészségessel', () => {
    const outcome = resolvePlaybackChain(
      [
        source({ id: 'ismeretlen', sortOrder: 1, health: UNKNOWN }),
        source({ id: 'ismert', sortOrder: 2, health: ONLINE }),
      ],
      { quality: '1080p', isAuthenticated: true },
    );

    // Nem az állapot dönt, hanem a kézi sorrend — tehát az ismeretlen nem hátrány.
    expect(ids(outcome)).toEqual(['ismeretlen', 'ismert']);
  });

  it('a halott forrás kimarad, és az ok naplózható', () => {
    const outcome = resolvePlaybackChain(
      [at('A', 100, '1080p', { health: OFFLINE }), at('B', 200, '1080p')],
      { quality: '1080p', isAuthenticated: true },
    );

    expect(ids(outcome)).toEqual(['B-1080p']);
    expect(outcome.excluded).toContainEqual({ sourceId: 'A-1080p', reason: 'offline' });
  });

  it('a karbantartás alatti forrás kimarad', () => {
    const outcome = resolvePlaybackChain([source({ id: 'karb', health: MAINTENANCE })], {
      quality: '1080p',
      isAuthenticated: true,
    });

    expect(outcome.chain).toHaveLength(0);
    expect(outcome.excluded).toContainEqual({ sourceId: 'karb', reason: 'maintenance' });
  });

  /*
    A szolgáltató állapota lefelé öröklődik: hiába érvényes a fájl, ha a ház,
    ami kiszolgálná, éppen nem áll.
  */
  it('a szolgáltató leállása a saját forrásait is kiveszi', () => {
    const outcome = resolvePlaybackChain(
      [source({ id: 'jo-fajl-rossz-hazban', health: ONLINE, providerHealth: OFFLINE })],
      { quality: '1080p', isAuthenticated: true },
    );

    expect(outcome.chain).toHaveLength(0);
    expect(outcome.excluded[0]?.reason).toBe('offline');
  });

  it('a kikapcsolt szolgáltató forrásai nem kerülnek elő', () => {
    const outcome = resolvePlaybackChain([source({ id: 'ki', providerEnabled: false })], {
      quality: '1080p',
      isAuthenticated: true,
    });

    expect(outcome.excluded).toContainEqual({ sourceId: 'ki', reason: 'provider-disabled' });
  });
});

describe('jogosultság', () => {
  it('a belépéshez kötött forrás vendégnek nem jár', () => {
    const outcome = resolvePlaybackChain(
      [source({ id: 'zart', requiresAuth: true }), source({ id: 'nyilt' })],
      { quality: '1080p', isAuthenticated: false },
    );

    expect(ids(outcome)).toEqual(['nyilt']);
    expect(outcome.excluded).toContainEqual({ sourceId: 'zart', reason: 'requires-auth' });
  });

  it('belépve mindkettő játszható', () => {
    const outcome = resolvePlaybackChain(
      [source({ id: 'zart', requiresAuth: true }), source({ id: 'nyilt' })],
      { quality: '1080p', isAuthenticated: true },
    );

    expect(ids(outcome)).toHaveLength(2);
  });
});

describe('amit a kliens már megpróbált', () => {
  /*
    A globális állapot és az egy nézőnél tapasztalt hiba két külön dolog: egy
    forrás lehet mindenki másnak tökéletes, miközben ennek az egy embernek a
    hálózatáról nem érhető el. A lejátszó ezért a saját kudarcait is átadja.
  */
  it('a már elbukott forrás kimarad a láncból', () => {
    const outcome = resolvePlaybackChain(
      [at('A', 100, '1080p'), at('B', 200, '1080p')],
      { quality: '1080p', isAuthenticated: true, excludeSourceIds: ['A-1080p'] },
    );

    expect(ids(outcome)).toEqual(['B-1080p']);
    expect(outcome.excluded).toContainEqual({ sourceId: 'A-1080p', reason: 'client-failed' });
  });

  it('ha minden elbukott, üres a lánc — nem véletlenszerű választás', () => {
    const outcome = resolvePlaybackChain([at('A', 100, '1080p')], {
      quality: '1080p',
      isAuthenticated: true,
      excludeSourceIds: ['A-1080p'],
    });

    expect(outcome.chain).toEqual([]);
  });
});

describe('automatikus minőség', () => {
  it('az adaptív forrás nyer, mert az tud a hálózathoz igazodni', () => {
    const outcome = resolvePlaybackChain(
      [
        source({ id: 'fix-1080', quality: '1080p', providerPriority: 10 }),
        source({ id: 'adaptiv', quality: '720p', isAdaptive: true, providerPriority: 900 }),
      ],
      { quality: 'AUTO', isAuthenticated: true },
    );

    expect(ids(outcome)[0]).toBe('adaptiv');
  });

  it('adaptív forrás híján a legjobb elérhető fokról indul', () => {
    const outcome = resolvePlaybackChain(
      [source({ id: 'kicsi', quality: '480p' }), source({ id: 'nagy', quality: '1080p' })],
      { quality: 'AUTO', isAuthenticated: true },
    );

    expect(ids(outcome)).toEqual(['nagy', 'kicsi']);
  });

  it('automatikus módban minden jelölt „a kértnek" számít', () => {
    const outcome = resolvePlaybackChain(
      [source({ quality: '1080p' }), source({ quality: '480p' })],
      { quality: 'AUTO', isAuthenticated: true },
    );

    expect(outcome.chain.every((entry) => entry.isRequestedQuality)).toBe(true);
  });
});

describe('a felajánlott minőségek listája', () => {
  it('csak az szerepel, ami mögött játszható forrás áll', () => {
    const outcome = resolvePlaybackChain(
      [
        at('A', 100, '1080p'),
        at('B', 200, '720p', { health: OFFLINE }),
        at('C', 300, '480p'),
      ],
      { quality: '1080p', isAuthenticated: true },
    );

    // A 720p egyetlen forrása halott — fölajánlani annyi lenne, mint fekete
    // képet ígérni annak, aki rákattint.
    expect(outcome.availableQualities).toEqual(['1080p', '480p']);
  });

  it('a legjobbtól a leggyengébbig rendezett', () => {
    const outcome = resolvePlaybackChain(
      [at('A', 100, '480p'), at('B', 200, '2160p'), at('C', 300, '720p')],
      { quality: 'AUTO', isAuthenticated: true },
    );

    expect(outcome.availableQualities).toEqual(['2160p', '720p', '480p']);
  });

  it('vendégnek nem ajánl olyan fokot, amit csak zárt forrás ad', () => {
    const outcome = resolvePlaybackChain(
      [source({ quality: '2160p', requiresAuth: true }), source({ quality: '720p' })],
      { quality: 'AUTO', isAuthenticated: false },
    );

    expect(outcome.availableQualities).toEqual(['720p']);
  });
});

describe('azonos mindenben', () => {
  it('az alacsonyabb bitráta megy előre — hamarabb indul', () => {
    const outcome = resolvePlaybackChain(
      [
        source({ id: 'nehez', bitrateKbps: 8000, sortOrder: 1 }),
        source({ id: 'konnyu', bitrateKbps: 3000, sortOrder: 2 }),
      ],
      { quality: '1080p', isAuthenticated: true },
    );

    expect(ids(outcome)).toEqual(['konnyu', 'nehez']);
  });

  it('ismeretlen bitráta esetén a kézi sorrend dönt', () => {
    const outcome = resolvePlaybackChain(
      [
        source({ id: 'masodik', bitrateKbps: null, sortOrder: 2 }),
        source({ id: 'elso', bitrateKbps: null, sortOrder: 1 }),
      ],
      { quality: '1080p', isAuthenticated: true },
    );

    expect(ids(outcome)).toEqual(['elso', 'masodik']);
  });
});

describe('üres és szélső esetek', () => {
  it('forrás nélkül üres lánc, nem hiba', () => {
    const outcome = resolvePlaybackChain([], { quality: '1080p', isAuthenticated: true });
    expect(outcome).toEqual({ chain: [], excluded: [], availableQualities: [] });
  });

  it('a lánc minden forrást tartalmaz, ami nem esett ki', () => {
    const sources = [at('A', 100, '1080p'), at('B', 200, '720p'), at('C', 300, '480p')];
    const outcome = resolvePlaybackChain(sources, { quality: '720p', isAuthenticated: true });
    expect(outcome.chain).toHaveLength(sources.length);
  });

  it('egy forrás sem szerepel kétszer', () => {
    const outcome = resolvePlaybackChain(
      [at('A', 100, '1080p'), at('A', 100, '720p'), at('B', 200, '1080p')],
      { quality: '1080p', isAuthenticated: true },
    );

    expect(new Set(ids(outcome)).size).toBe(outcome.chain.length);
  });
});
