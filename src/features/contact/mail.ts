import type { MailMessage } from '@/infrastructure/mail/transport';

/** A visszaigazolás, amit a kapcsolati űrlap küldője kap. */
export const contactMail = {
  contactReceipt(name: string): Omit<MailMessage, 'to'> {
    return {
      subject: 'Megkaptuk az üzeneted',
      preheader: 'Hamarosan válaszolunk.',
      text: `Szia ${name}!\n\nKöszönjük, hogy írtál nekünk. Az üzeneted megérkezett, és a csapat általában 2–5 napon belül válaszol.\n\nÜdv,\na Yonagi Fansub csapata`,
    };
  },
};
