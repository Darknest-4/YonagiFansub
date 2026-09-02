import type { MailMessage } from '@/infrastructure/mail/transport';

/**
 * Az értesítő levelek szövege.
 *
 * Ide az a levél tartozik, amit a néző a saját beállítása miatt kap: új rész,
 * új hír, vagy a kettő összefoglalója. A feliratkozás kezelése és a kézbesítés
 * a `service.ts`-ben és a `digest.ts`-ben van — itt csak a szöveg.
 */
export const notificationMail = {
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
};
