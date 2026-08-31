import 'server-only';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { escapeHtml } from '@/lib/markdown';
import { optionalImport } from '@/lib/optional-module';

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
  url: env.NEXT_PUBLIC_SITE_URL,
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

function createDriver(): MailDriver {
  switch (env.MAIL_DRIVER) {
    case 'smtp':
      return new SmtpDriver();
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

// ── Templates ────────────────────────────────────────────────────────────────

export const mailTemplates = {
  verifyEmail(displayName: string, url: string): Omit<MailMessage, 'to'> {
    return {
      subject: 'Erősítsd meg az e-mail-címed',
      preheader: 'Egy kattintás, és aktív a Yonagi Fansub fiókod.',
      text: `Szia ${displayName}!\n\nKöszönjük, hogy regisztráltál a Yonagi Fansubra. Az utolsó lépés az e-mail-címed megerősítése.\n\nA link 24 óráig érvényes.`,
      action: { label: 'E-mail-cím megerősítése', url },
    };
  },

  resetPassword(displayName: string, url: string): Omit<MailMessage, 'to'> {
    return {
      subject: 'Jelszó visszaállítása',
      preheader: 'A link 1 óráig érvényes.',
      text: `Szia ${displayName}!\n\nJelszó-visszaállítási kérés érkezett a fiókodhoz. Ha te kérted, az alábbi gombbal állíthatsz be új jelszót.\n\nA link 1 óráig érvényes, és csak egyszer használható fel. Ha nem te kérted, nem kell tenned semmit — a jelszavad változatlan marad.`,
      action: { label: 'Új jelszó beállítása', url },
    };
  },

  passwordChanged(displayName: string): Omit<MailMessage, 'to'> {
    return {
      subject: 'A jelszavad megváltozott',
      preheader: 'Biztonsági értesítés a fiókodról.',
      text: `Szia ${displayName}!\n\nA fiókod jelszava az imént megváltozott, és minden más eszközön kiléptettünk a biztonság kedvéért.\n\nHa nem te voltál, azonnal állíts vissza új jelszót, és jelezd nekünk a kapcsolati űrlapon.`,
      action: { label: 'Fiókbeállítások', url: `${env.NEXT_PUBLIC_SITE_URL}/profil/beallitasok` },
    };
  },

  newRelease(displayName: string, projectTitle: string, label: string, url: string): Omit<MailMessage, 'to'> {
    return {
      subject: `Új kiadás: ${projectTitle} – ${label}`,
      preheader: `${projectTitle} ${label} elérhető.`,
      text: `Szia ${displayName}!\n\nMegjelent a(z) ${projectTitle} új kiadása: ${label}.\n\nJó nézést!`,
      action: { label: 'Megnézem', url },
    };
  },

  newsPost(
    displayName: string,
    title: string,
    excerpt: string | null,
    url: string,
  ): Omit<MailMessage, 'to'> {
    return {
      subject: title,
      preheader: excerpt ?? 'Új bejegyzés a Yonagi Fansubtól.',
      text: `Szia ${displayName}!\n\n${title}\n\n${excerpt ?? 'Új bejegyzés érkezett az oldalra.'}`,
      action: { label: 'Elolvasom', url },
    };
  },

  /**
   * The digest: one email standing in for everything that happened.
   *
   * Written as a plain list rather than a designed newsletter, because that is
   * what it is — somebody asked to hear less often, not to be marketed to. The
   * count goes in the subject line so the mail can be judged without opening it.
   */
  digest(
    displayName: string,
    period: 'daily' | 'weekly',
    items: Array<{ title: string; body: string | null }>,
    url: string,
  ): Omit<MailMessage, 'to'> {
    const window = period === 'daily' ? 'ma' : 'a héten';
    const lines = items
      .map((item) => `• ${item.title}${item.body ? ` — ${item.body}` : ''}`)
      .join('\n');

    return {
      subject:
        items.length === 1
          ? `Egy újdonság ${window} a Yonagi Fansubon`
          : `${items.length} újdonság ${window} a Yonagi Fansubon`,
      preheader: items[0]?.title ?? 'Összefoglaló a Yonagi Fansubtól.',
      text:
        `Szia ${displayName}!\n\nEz történt ${window}:\n\n${lines}\n\n` +
        'Ha ritkábban vagy egyáltalán nem kérnéd ezt a levelet, a fiókbeállításokban átállíthatod.',
      action: { label: 'Megnézem az oldalon', url },
    };
  },

  contactReceipt(name: string): Omit<MailMessage, 'to'> {
    return {
      subject: 'Megkaptuk az üzeneted',
      preheader: 'Hamarosan válaszolunk.',
      text: `Szia ${name}!\n\nKöszönjük, hogy írtál nekünk. Az üzeneted megérkezett, és a csapat általában 2–5 napon belül válaszol.\n\nÜdv,\na Yonagi Fansub csapata`,
    };
  },
};
