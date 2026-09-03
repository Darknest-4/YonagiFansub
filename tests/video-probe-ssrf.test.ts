import { describe, expect, it } from 'vitest';
import { probeUrl } from '@/features/video/adapters/probe';

/**
 * Az állapotellenőrző kimenő kérésének védelme.
 *
 * Ez a rendszer legveszélyesebb pontja: egy admin által megadott címre indítunk
 * kérést **a szerverünk nevében**. Aki forrást vehet fel, az e nélkül a védelem
 * nélkül a szerverünkkel kéretne le bármit, amit a szerver elér — belső
 * szolgáltatásokat, a felhő metaadat-végpontját, adatbázis-portokat.
 *
 * A tesztek szándékosan olyan címeket használnak, amikre **nem indul valódi
 * hálózati kérés**: mindegyik a védelmen bukik el, még a kapcsolat megnyitása
 * előtt. Ha egy nap valamelyik mégis kimenne, ez a fájl azzal jelezné, hogy
 * időtúllépésbe fordul a másodpercek helyett.
 */

describe('privát címtartományok', () => {
  const blocked = [
    ['loopback', 'http://127.0.0.1:5432/'],
    ['loopback IPv6', 'http://[::1]:8080/'],
    ['privát A osztály', 'http://10.0.0.5/video.mp4'],
    ['privát B osztály', 'http://172.16.3.9/video.mp4'],
    ['privát C osztály', 'http://192.168.1.1/admin'],
    ['link-local', 'http://169.254.169.254/latest/meta-data/'],
    ['carrier NAT', 'http://100.64.0.1/'],
    ['csupa nulla', 'http://0.0.0.0/'],
  ] as const;

  for (const [name, url] of blocked) {
    it(`${name} elutasítva`, async () => {
      const result = await probeUrl(url, { timeoutMs: 2000 });
      expect(result.state).toBe('UNAVAILABLE');
      expect(result.detail).toContain('nem nyilvános');
    });
  }

  /*
    A felhő metaadat-végpontja a klasszikus célpont: onnan szerezhető meg a
    példány szerepköréhez tartozó ideiglenes hitelesítő adat. Külön nevesítve,
    mert ha valaha egyetlen teszt maradhatna itt, ez lenne az.
  */
  it('a felhő metaadat-címe sosem érhető el', async () => {
    const result = await probeUrl('http://169.254.169.254/latest/meta-data/iam/', {
      timeoutMs: 2000,
    });
    expect(result.state).toBe('UNAVAILABLE');
  });
});

describe('sémák és alakok', () => {
  it('a file:// nem ellenőrizhető', async () => {
    const result = await probeUrl('file:///etc/passwd');
    expect(result.state).toBe('UNAVAILABLE');
    expect(result.detail).toContain('http');
  });

  it('a gopher:// sem', async () => {
    const result = await probeUrl('gopher://127.0.0.1:6379/_INFO');
    expect(result.state).toBe('UNAVAILABLE');
  });

  it('az értelmezhetetlen cím nem omlik el', async () => {
    const result = await probeUrl('nem-egy-url');
    expect(result.state).toBe('UNAVAILABLE');
    expect(result.detail).toContain('Értelmezhetetlen');
  });

  it('üres cím sem', async () => {
    const result = await probeUrl('');
    expect(result.state).toBe('UNAVAILABLE');
  });
});

describe('amit a válasz nem árul el', () => {
  /*
    Az elutasítás indoka nem mondhatja meg, mi van a belső hálózaton. „A cím nem
    nyilvános” elég; egy „connection refused a 5432-es porton” viszont egy
    portszkennelési csatorna.
  */
  it('a hibaüzenet nem szivárogtat belső részletet', async () => {
    const result = await probeUrl('http://10.1.2.3:6379/', { timeoutMs: 2000 });
    expect(result.detail).not.toContain('6379');
    expect(result.detail).not.toContain('10.1.2.3');
    expect(result.detail).not.toContain('ECONNREFUSED');
  });
});
