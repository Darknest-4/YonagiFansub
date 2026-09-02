import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Resend driver.
 *
 * Worth pinning because every failure here is invisible: `sendMail` never
 * throws by design, so a driver that builds the wrong request, or one that
 * outruns the provider's rate limit, produces a site where nobody can reset a
 * password and nothing anywhere says why.
 *
 * The environment is stubbed before the module loads: `lib/env` parses at import
 * time, and `lib/mail` picks its driver at import time too, so both have to see
 * the Resend settings from the first moment.
 */

const ORIGINAL_ENV = { ...process.env };

function stubEnv(): void {
  process.env.MAIL_DRIVER = 'resend';
  process.env.RESEND_API_KEY = 're_teszt_kulcs_123';
  process.env.MAIL_FROM = 'Yonagi Fansub <noreply@example.com>';
  process.env.AUTH_SECRET = 'teszt-titok-elegge-hosszu-ahhoz-hogy-atmenjen-1234';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://yonagi.example';
}

/** Imports a fresh `lib/mail` with the stubbed environment applied. */
async function loadMail() {
  vi.resetModules();
  stubEnv();
  return import('@/lib/mail');
}

let calls: Array<{ url: string; init: RequestInit }>;

function mockFetch(responder: (call: number) => Response): void {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      return responder(calls.length);
    }),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
});

describe('Resend kérés összeállítása', () => {
  it('a Resend API-nak küld, a kulccsal és mindkét törzsformátummal', async () => {
    mockFetch(() => new Response('{"id":"abc"}', { status: 200 }));
    const { sendMail } = await loadMail();

    await sendMail({
      to: 'olvaso@example.com',
      subject: 'Új kiadás',
      text: 'Megjelent az 1. rész.',
      action: { label: 'Megnézem', url: 'https://yonagi.example/projektek/x' },
    });

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call!.url).toBe('https://api.resend.com/emails');
    expect(call!.init.method).toBe('POST');

    const headers = call!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer re_teszt_kulcs_123');

    const body = JSON.parse(String(call!.init.body)) as Record<string, unknown>;
    expect(body.from).toBe('Yonagi Fansub <noreply@example.com>');
    // A címzett tömbben megy — a Resend így várja.
    expect(body.to).toEqual(['olvaso@example.com']);
    expect(body.subject).toBe('Új kiadás');
    expect(body.text).toBe('Megjelent az 1. rész.');
    // A HTML változat is elmegy, benne a gomb linkjével.
    expect(String(body.html)).toContain('https://yonagi.example/projektek/x');
  });

  /*
    A levélküldés sosem dobhat hibát — egy elutasított levél nem buktathatja meg
    a regisztrációt. Ellenben nyom nélkül sem tűnhet el.
  */
  it('az elutasítást nem dobja tovább, hanem naplózza', async () => {
    mockFetch(() => new Response('{"message":"Domain not verified"}', { status: 422 }));
    const { sendMail } = await loadMail();

    await expect(
      sendMail({ to: 'a@example.com', subject: 'Teszt', text: 'Szöveg' }),
    ).resolves.toBeUndefined();

    expect(calls).toHaveLength(1);
  });
});

describe('sebességkorlát', () => {
  /*
    Az ingyenes csomag másodpercenként két kérést enged. Az értesítés-kiküldés
    ötvenes csomagokban, párhuzamosan hívna — abból két elfogadott levél lenne és
    negyvennyolc elutasított, csendben. Ezért a meghajtó sorba állítja őket.
  */
  it('nem indít két kérést egyszerre, hanem kivárja a szünetet', async () => {
    mockFetch(() => new Response('{}', { status: 200 }));
    const { sendMail } = await loadMail();

    const first = sendMail({ to: 'a@example.com', subject: 'Egy', text: 'x' });
    const second = sendMail({ to: 'b@example.com', subject: 'Kettő', text: 'y' });

    await first;
    expect(calls).toHaveLength(1);

    // A második csak a szünet letelte után indul el.
    await vi.advanceTimersByTimeAsync(600);
    await second;
    expect(calls).toHaveLength(2);
  });

  it('a 429-et egyszer újrapróbálja, a Retry-After szerint', async () => {
    mockFetch((call) =>
      call === 1
        ? new Response('{}', { status: 429, headers: { 'retry-after': '2' } })
        : new Response('{}', { status: 200 }),
    );
    const { sendMail } = await loadMail();

    const send = sendMail({ to: 'a@example.com', subject: 'Teszt', text: 'x' });
    await vi.advanceTimersByTimeAsync(3_000);
    await send;

    expect(calls).toHaveLength(2);
  });
});

describe('konfiguráció', () => {
  it('kulcs nélküli resend beállítás indításkor elbukik, nem küldéskor', async () => {
    vi.resetModules();
    stubEnv();
    delete process.env.RESEND_API_KEY;

    await expect(import('@/infrastructure/env')).rejects.toThrow(/RESEND_API_KEY/);
  });
});
