import { describe, expect, it } from 'vitest';
import {
  DEGRADE_AFTER_FAILURES,
  OFFLINE_AFTER_FAILURES,
  classifyHealth,
  isAlertWorthy,
  rollingLatency,
  type HealthInput,
} from '@/features/video/health-rules';

/**
 * Az állapotbesorolás szabályai.
 *
 * Ez a rész csendben tud elromlani: egy túl szigorú küszöb működő forrásokat vesz
 * ki úgy, hogy a néző csak annyit lát, „nincs elérhető videó", egy túl elnéző
 * pedig hagyja, hogy belefusson egy halott linkbe. Egyik hiba sem esik ki egy
 * kézi próbán, ezért van itt minden átmenetre teszt.
 */

function input(over: Partial<HealthInput> = {}): HealthInput {
  return {
    result: { state: 'AVAILABLE', detail: 'HTTP 200', latencyMs: 200 },
    previousStatus: 'UNKNOWN',
    previousFailureCount: 0,
    previousAverageLatencyMs: null,
    isMaintenance: false,
    slowThresholdMs: 2500,
    ...over,
  };
}

const fail = { state: 'UNAVAILABLE' as const, detail: 'HTTP 404', latencyMs: 90 };
const ok = { state: 'AVAILABLE' as const, detail: 'HTTP 200', latencyMs: 200 };
const dunno = { state: 'UNKNOWN' as const, detail: 'Nincs adapter.', latencyMs: null };

describe('sikeres mérés', () => {
  it('gyors válasz → online', () => {
    expect(classifyHealth(input()).status).toBe('ONLINE');
  });

  it('lassú válasz → akadozó, nem online', () => {
    const verdict = classifyHealth(
      input({ result: { ...ok, latencyMs: 9000 }, previousAverageLatencyMs: 9000 }),
    );
    expect(verdict.status).toBe('DEGRADED');
  });

  /*
    Ez a döntés kimondottan szándékos: aki most válaszol, az most jó. A hibák
    „emlékének" megtartása azt jelentené, hogy egy egyszer elakadt forrás napokig
    hátrébb sorolva marad, pedig semmi baja.
  */
  it('a siker azonnal nullázza a hibaszámlálót', () => {
    const verdict = classifyHealth(
      input({ previousStatus: 'OFFLINE', previousFailureCount: 9 }),
    );
    expect(verdict.failureCount).toBe(0);
    expect(verdict.status).toBe('ONLINE');
  });

  it('a sikert siker gyanánt jelöli', () => {
    expect(classifyHealth(input()).wasSuccess).toBe(true);
  });
});

describe('sikertelen mérés — a fokozatosság', () => {
  /*
    A legfontosabb szabály. Egyetlen hibából lehet hálózati zökkenő; a büntetés
    (kiesés a láncból) sokkal drágább, mint a haszon.
  */
  it('az első hiba nem változtat állapotot', () => {
    const verdict = classifyHealth(
      input({ result: fail, previousStatus: 'ONLINE', previousFailureCount: 0 }),
    );
    expect(verdict.status).toBe('ONLINE');
    expect(verdict.failureCount).toBe(1);
  });

  it(`a ${DEGRADE_AFTER_FAILURES}. hibától akadozó`, () => {
    const verdict = classifyHealth(
      input({
        result: fail,
        previousStatus: 'ONLINE',
        previousFailureCount: DEGRADE_AFTER_FAILURES - 1,
      }),
    );
    expect(verdict.status).toBe('DEGRADED');
  });

  it(`a ${OFFLINE_AFTER_FAILURES}. hibától halott`, () => {
    const verdict = classifyHealth(
      input({
        result: fail,
        previousStatus: 'DEGRADED',
        previousFailureCount: OFFLINE_AFTER_FAILURES - 1,
      }),
    );
    expect(verdict.status).toBe('OFFLINE');
  });

  it('a küszöb alatt nem lehet halott, akárhány kör után', () => {
    for (let count = 0; count < OFFLINE_AFTER_FAILURES - 1; count += 1) {
      const verdict = classifyHealth(
        input({ result: fail, previousStatus: 'ONLINE', previousFailureCount: count }),
      );
      expect(verdict.status, `${count} korábbi hiba után`).not.toBe('OFFLINE');
    }
  });

  it('a hibaszámláló minden sikertelen körben nő', () => {
    expect(classifyHealth(input({ result: fail, previousFailureCount: 7 })).failureCount).toBe(8);
  });
});

describe('az „ismeretlen” eredmény', () => {
  /*
    Ez nem a forrásról szól, hanem rólunk: nem tudtuk megállapítani. Ebből nem
    következik, hogy a forrás rossz — és ha hibának számítanánk, egy percnyi
    tárolókimaradás négy kör alatt minden saját forrásunkat halottnak jelölné.
  */
  it('nem növeli a hibaszámlálót', () => {
    const verdict = classifyHealth(
      input({ result: dunno, previousStatus: 'ONLINE', previousFailureCount: 1 }),
    );
    expect(verdict.failureCount).toBe(1);
  });

  it('megtartja a korábbi állapotot', () => {
    expect(classifyHealth(input({ result: dunno, previousStatus: 'ONLINE' })).status).toBe('ONLINE');
    expect(classifyHealth(input({ result: dunno, previousStatus: 'OFFLINE' })).status).toBe('OFFLINE');
  });

  it('nem rontja el a válaszidő-átlagot', () => {
    const verdict = classifyHealth(
      input({ result: dunno, previousAverageLatencyMs: 300 }),
    );
    expect(verdict.averageLatencyMs).toBe(300);
  });
});

describe('kézi karbantartás', () => {
  /*
    Amit ember vett ki, azt egy éjszakai ellenőrzés nem teheti vissza —
    különben a „kikapcsoltam, mert épp cserélem a fájlt" reggelre magától
    visszakapcsolna.
  */
  it('a sikeres mérés sem hozza vissza magától', () => {
    const verdict = classifyHealth(input({ isMaintenance: true, result: ok }));
    expect(verdict.status).toBe('MAINTENANCE');
  });

  it('a sikertelen mérés sem viszi halottba', () => {
    const verdict = classifyHealth(
      input({ isMaintenance: true, result: fail, previousFailureCount: 99 }),
    );
    expect(verdict.status).toBe('MAINTENANCE');
  });

  it('a mérés eredményét azért eltárolja', () => {
    const verdict = classifyHealth(input({ isMaintenance: true, result: ok }));
    expect(verdict.wasSuccess).toBe(true);
  });

  it('karbantartásból kilépve nem találgat, hanem ismeretlent mond', () => {
    // A karbantartás vége után az első mérés dönt; addig nem állítunk semmit.
    const verdict = classifyHealth(
      input({ isMaintenance: false, previousStatus: 'MAINTENANCE', result: dunno }),
    );
    expect(verdict.status).toBe('UNKNOWN');
  });
});

describe('a gördülő válaszidő', () => {
  it('első mérésnél maga az érték', () => {
    expect(rollingLatency(null, 400)).toBe(400);
  });

  it('hiányzó mintánál változatlan', () => {
    expect(rollingLatency(300, null)).toBe(300);
  });

  it('egy kiugró érték nem mozdítja el érdemben', () => {
    const after = rollingLatency(200, 5000)!;
    expect(after).toBeLessThan(2000);
    expect(after).toBeGreaterThan(200);
  });

  it('tartós romlás néhány kör alatt átüt', () => {
    let value: number | null = 200;
    for (let round = 0; round < 6; round += 1) value = rollingLatency(value, 5000);
    expect(value!).toBeGreaterThan(2500);
  });

  it('javulás esetén visszaesik', () => {
    let value: number | null = 5000;
    for (let round = 0; round < 10; round += 1) value = rollingLatency(value, 150);
    expect(value!).toBeLessThan(1000);
  });
});

describe('mi éri meg a riasztást', () => {
  /*
    Nem minden változás hír. A feladat kimondottan kéri, hogy ne menjen minden
    esemény Discordra — az `ONLINE → DEGRADED` a leggyakoribb átmenet, és
    riasztásként pont annyit érne, mint a semmi.
  */
  it('a leállás riaszt', () => {
    expect(isAlertWorthy('ONLINE', 'OFFLINE')).toBe(true);
    expect(isAlertWorthy('DEGRADED', 'OFFLINE')).toBe(true);
  });

  it('a helyreállás riaszt', () => {
    expect(isAlertWorthy('OFFLINE', 'ONLINE')).toBe(true);
  });

  it('az akadozás nem riaszt', () => {
    expect(isAlertWorthy('ONLINE', 'DEGRADED')).toBe(false);
    expect(isAlertWorthy('DEGRADED', 'ONLINE')).toBe(false);
  });

  it('a változatlan állapot nem riaszt', () => {
    expect(isAlertWorthy('OFFLINE', 'OFFLINE')).toBe(false);
  });

  it('a karbantartásba tétel nem riaszt — az szándékos volt', () => {
    expect(isAlertWorthy('ONLINE', 'MAINTENANCE')).toBe(false);
  });
});

describe('teljes életciklus', () => {
  /*
    Egy forrás útja végig: egészséges → elromlik → halott → helyreáll. A
    lépésenkénti tesztek mindegyike igaz lehet úgy is, hogy a lánc mégis
    megakad valahol — ez az egy teszt végigviszi.
  */
  it('egészségestől a halottig és vissza', () => {
    let status: HealthInput['previousStatus'] = 'UNKNOWN';
    let failures = 0;
    let latency: number | null = null;

    const step = (result: HealthInput['result']) => {
      const verdict = classifyHealth(
        input({
          result,
          previousStatus: status,
          previousFailureCount: failures,
          previousAverageLatencyMs: latency,
        }),
      );
      status = verdict.status;
      failures = verdict.failureCount;
      latency = verdict.averageLatencyMs;
      return verdict.status;
    };

    expect(step(ok)).toBe('ONLINE');
    expect(step(fail)).toBe('ONLINE'); // első hiba: még nem szólunk
    expect(step(fail)).toBe('DEGRADED');
    expect(step(fail)).toBe('DEGRADED');
    expect(step(fail)).toBe('OFFLINE');
    expect(step(ok)).toBe('ONLINE'); // egyetlen siker visszahozza
    expect(failures).toBe(0);
  });
});
