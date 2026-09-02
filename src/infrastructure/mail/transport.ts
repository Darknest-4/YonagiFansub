import 'server-only';
import { env } from '@/infrastructure/env';
import { logger } from '@/infrastructure/logger';
import { escapeHtml } from '@/shared/lib/markdown';
import { optionalImport } from '@/infrastructure/optional-module';
import { memoizeWithTtl } from '@/infrastructure/cache';
import { mailSiteUrl } from '@/shared/lib/site-url';

/**
 * Transactional mail.
 *
 * A driver interface with a console implementation for development and an SMTP
 * implementation that is loaded lazily. Mail is *never* on the critical path:
 * `send()` resolves even when delivery fails, because a password-reset request
 * must not tell the caller whether the address exists, and a failed welcome mail
 * must not roll back a registration.
 */

export interface MailMessage {
  to: string;
  subject: string;
  /** Plain-text body. The HTML version is generated from it. */
  text: string;
  /** Optional call-to-action rendered as a button in the HTML version. */
  action?: { label: string; url: string };
  preheader?: string;
}

interface MailDriver {
  send(message: MailMessage): Promise<void>;
}

const BRAND = {
  name: 'Yonagi Fansub',
  url: mailSiteUrl(),
  accent: '#f761a8',
  background: '#05070f',
  surface: '#111729',
  text: '#e6ecff',
  muted: '#8f9bbd',
};

/** Dark, brand-consistent email shell. Table layout for client compatibility. */
export function renderEmailHtml(message: MailMessage): string {
  const paragraphs = message.text
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 16px;line-height:1.65;">${escapeHtml(block).replace(/\n/g, '<br />')}</p>`)
    .join('');

  const button = message.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0;">
         <tr><td style="border-radius:10px;background:${BRAND.accent};">
           <a href="${escapeHtml(message.action.url)}"
              style="display:inline-block;padding:13px 26px;font-weight:600;font-size:15px;color:#05070f;text-decoration:none;border-radius:10px;">
             ${escapeHtml(message.action.label)}
           </a>
         </td></tr>
       </table>
       <p style="margin:0 0 16px;font-size:13px;color:${BRAND.muted};line-height:1.6;">
         Ha a gomb nem működik, másold be ezt a linket a böngésződbe:<br />
         <span style="color:${BRAND.accent};word-break:break-all;">${escapeHtml(message.action.url)}</span>
       </p>`
    : '';

  return `<!doctype html>
<html lang="hu">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(message.subject)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.background};color:${BRAND.text};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(message.preheader ?? '')}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.background};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${BRAND.surface};border:1px solid #232c46;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:28px 32px 8px;">
          <span style="font-size:13px;letter-spacing:.22em;text-transform:uppercase;color:${BRAND.accent};font-weight:700;">夜凪 · ${BRAND.name}</span>
        </td></tr>
        <tr><td style="padding:8px 32px 32px;font-size:15px;color:${BRAND.text};">
          <h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;font-weight:700;">${escapeHtml(message.subject)}</h1>
          ${paragraphs}
          ${button}
        </td></tr>
        <tr><td style="padding:20px 32px;border-top:1px solid #232c46;font-size:12px;color:${BRAND.muted};line-height:1.6;">
          Ezt a levelet a <a href="${BRAND.url}" style="color:${BRAND.accent};text-decoration:none;">${BRAND.name}</a> küldte.
          Ha nem te kérted, nyugodtan hagyd figyelmen kívül — ilyenkor semmi nem történik a fiókoddal.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

class ConsoleDriver implements MailDriver {
  async send(message: MailMessage): Promise<void> {
    logger.info('[mail:console] Outgoing message', {
      to: message.to,
      subject: message.subject,
      action: message.action?.url,
    });
    // The full body is printed only in development, where it replaces an inbox.
    if (env.NODE_ENV === 'development') {
      console.log(`\n──────── MAIL ────────\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n${message.action ? `\n→ ${message.action.label}: ${message.action.url}\n` : ''}──────────────────────\n`);
    }
  }
}

class NoopDriver implements MailDriver {
  async send(): Promise<void> {
    /* intentionally silent – used in tests */
  }
}

class SmtpDriver implements MailDriver {
  async send(message: MailMessage): Promise<void> {
    // `nodemailer` is an optional dependency: installations that never send mail
    // should not have to carry it. Install it when MAIL_DRIVER=smtp.
    const nodemailer = await optionalImport<{
      createTransport: (options: unknown) => {
        sendMail: (options: unknown) => Promise<unknown>;
      };
    }>('nodemailer');

    if (!nodemailer) {
      logger.error(
        'MAIL_DRIVER=smtp but `nodemailer` is not installed. Run `npm i nodemailer`.',
      );
      return;
    }

    const transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? 587,
      secure: (env.SMTP_PORT ?? 587) === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    });

    await transport.sendMail({
      from: env.MAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: renderEmailHtml(message),
    });
  }
}

/**
 * Resend (https://resend.com) over its HTTP API.
 *
 * Chosen over SMTP for a fansub deployment because it needs no extra dependency,
 * no long-lived connection, and no port 25/587 egress — which is exactly what a
 * platform-as-a-service host tends to block. One `fetch` per message.
 *
 * ## Pacing, and why it is not optional
 *
 * Resend's free plan allows **two requests per second**. The notification
 * fan-out sends in parallel chunks of fifty, which under that limit means two
 * accepted messages and forty-eight rejections — and since `sendMail` swallows
 * failures by design, the whole thing would look like it worked. So this driver
 * serialises: every send joins a queue and waits out a minimum gap. A hundred
 * announcement emails take about a minute, which is fine for work that is
 * already detached from the request.
 *
 * A 429 that slips through anyway is retried once, honouring `Retry-After`.
 *
 * ## Failures are named, not swallowed
 *
 * `sendMail` deliberately never throws, so a rejected send would otherwise
 * vanish. The three that actually happen are spelled out in the log with what to
 * do about them — an unverified sender domain in particular is the one thing
 * that silently stops every email on a fresh deployment.
 */
class ResendDriver implements MailDriver {
  private static readonly ENDPOINT = 'https://api.resend.com/emails';

  /** Minimum spacing between requests: two per second, with room to spare. */
  private static readonly GAP_MS = 550;

  /** Serialises sends across the whole process. */
  private queue: Promise<unknown> = Promise.resolve();
  private lastSentAt = 0;

  async send(message: MailMessage): Promise<void> {
    // Chain onto the queue so concurrent callers line up instead of racing.
    const task = this.queue.then(() => this.dispatch(message));
    // The queue must survive a failed send, or one error stalls every later mail.
    this.queue = task.catch(() => undefined);
    await task;
  }

  private async dispatch(message: MailMessage): Promise<void> {
    const wait = ResendDriver.GAP_MS - (Date.now() - this.lastSentAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));

    let response = await this.post(message);

    if (response.status === 429) {
      const after = Number(response.headers.get('retry-after') ?? 1);
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(Number.isFinite(after) ? after * 1000 : 1000, 10_000)),
      );
      response = await this.post(message);
    }

    this.lastSentAt = Date.now();

    if (response.ok) return;

    const body = await response.text().catch(() => '');
    logger.error('Resend elutasította a levelet', undefined, {
      status: response.status,
      to: message.to,
      subject: message.subject,
      hint: ResendDriver.hintFor(response.status),
      body: body.slice(0, 400),
    });
  }

  private post(message: MailMessage): Promise<Response> {
    return fetch(ResendDriver.ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: renderEmailHtml(message),
      }),
    });
  }

  /** The three failures that actually happen, and what fixes each. */
  private static hintFor(status: number): string {
    if (status === 401) {
      return 'A RESEND_API_KEY hibás vagy visszavonva — új kulcs: https://resend.com/api-keys';
    }
    if (status === 403) {
      return 'Elutasított kapcsolat: rossz kulcs, vagy a szerver kimenő forgalma korlátozott az api.resend.com felé.';
    }
    if (status === 422) {
      return `A MAIL_FROM feladó (${env.MAIL_FROM}) domainje nincs igazolva a Resendben. Igazold a https://resend.com/domains alatt, vagy teszteléshez használd az onboarding@resend.dev címet.`;
    }
    if (status === 429) {
      return 'Elérted a Resend küldési korlátját (ingyenes csomag: 2 kérés/mp, 100 levél/nap).';
    }
    return 'Lásd a Resend válaszát alább.';
  }
}

/**
 * Can this instance actually send mail right now?
 *
 * There is one way for a correctly configured Resend deployment to still send
 * nothing: the sender's domain is not verified, and every request comes back
 * 422. Nothing about that is visible from the outside — the site works, accounts
 * register, and password resets vanish. It is the single most likely reason mail
 * is broken on a fresh deploy, and it is invisible precisely because sending is
 * fire-and-forget.
 *
 * So the admin dashboard asks. `GET /domains` is a cheap, read-only call and the
 * answer is exactly the question an operator has: *will my mail go out?*
 *
 * Memoised for five minutes: the dashboard is opened often, the answer changes
 * about once in the life of an instance, and a broken key should not turn into a
 * request per page view.
 */
export interface MailStatus {
  driver: string;
  /** False only when something concrete is wrong, and `detail` says what. */
  ok: boolean;
  detail: string;
}

async function probeResend(): Promise<MailStatus> {
  const sender = env.MAIL_FROM.match(/<([^>]+)>/)?.[1] ?? env.MAIL_FROM;
  const domain = sender.split('@')[1]?.toLowerCase() ?? '';

  // Resend's own test sender always works, but only reaches the account owner.
  if (domain === 'resend.dev') {
    return {
      driver: 'Resend',
      ok: false,
      detail: 'Teszt feladó — csak a Resend-fiók tulajdonosának kézbesít. Igazolj saját domaint.',
    };
  }

  try {
    const response = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
      signal: AbortSignal.timeout(6_000),
    });

    if (response.status === 401) {
      return { driver: 'Resend', ok: false, detail: 'A RESEND_API_KEY érvénytelen vagy visszavonva.' };
    }
    // A 403 jöhet a Resendtől, de jöhet egy közbeékelt kimenő proxytól is —
    // ezt innen nem lehet megkülönböztetni, és a rossz tipp órákat visz el.
    if (response.status === 403) {
      return {
        driver: 'Resend',
        ok: false,
        detail: 'A Resend elutasította a kapcsolatot — vagy a kulcs rossz, vagy a kimenő forgalom korlátozott.',
      };
    }
    if (!response.ok) {
      return { driver: 'Resend', ok: true, detail: `Nem ellenőrizhető (HTTP ${response.status}).` };
    }

    const payload = (await response.json()) as { data?: Array<{ name?: string; status?: string }> };
    const match = payload.data?.find((entry) => entry.name?.toLowerCase() === domain);

    if (!match) {
      return {
        driver: 'Resend',
        ok: false,
        detail: `A(z) ${domain} domain nincs felvéve a Resendbe — a levelek elutasításra kerülnek.`,
      };
    }
    if (match.status !== 'verified') {
      return {
        driver: 'Resend',
        ok: false,
        detail: `A(z) ${domain} domain még nincs igazolva (állapot: ${match.status ?? 'ismeretlen'}).`,
      };
    }

    return { driver: 'Resend', ok: true, detail: `Kimenő feladó: ${domain}` };
  } catch {
    // A failed probe is not a failed configuration — the network may be the
    // problem. Saying "unknown" beats a red light that sends someone hunting.
    return { driver: 'Resend', ok: true, detail: 'A Resend most nem érhető el — az állapot ismeretlen.' };
  }
}

export const getMailStatus = memoizeWithTtl<MailStatus>(async () => {
  switch (env.MAIL_DRIVER) {
    case 'resend':
      return probeResend();
    case 'smtp':
      return { driver: 'SMTP', ok: true, detail: `Kimenő szerver: ${env.SMTP_HOST ?? '—'}` };
    case 'noop':
      return { driver: 'Kikapcsolva', ok: false, detail: 'Semmi nem megy ki.' };
    default:
      return {
        driver: 'Konzol (fejlesztői)',
        ok: false,
        detail: 'A levelek a naplóba íródnak, nem mennek ki.',
      };
  }
}, 5 * 60_000);

function createDriver(): MailDriver {
  switch (env.MAIL_DRIVER) {
    case 'smtp':
      return new SmtpDriver();
    case 'resend':
      return new ResendDriver();
    case 'noop':
      return new NoopDriver();
    default:
      return new ConsoleDriver();
  }
}

const driver = createDriver();

/** Fire-and-forget send. Never throws; delivery failures are logged. */
export async function sendMail(message: MailMessage): Promise<void> {
  try {
    await driver.send(message);
  } catch (error) {
    logger.error('Mail delivery failed', error, { to: message.to, subject: message.subject });
  }
}
