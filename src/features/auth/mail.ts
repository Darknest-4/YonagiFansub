import { mailSiteUrl } from '@/shared/lib/site-url';
import type { MailMessage } from '@/infrastructure/mail/transport';

/**
 * A fiókkal kapcsolatos levelek szövege.
 *
 * A sablonok a feature-nél laknak, nem a küldő infrastruktúránál: a szöveg
 * arról szól, mi történt a fiókkal, és azzal együtt változik. Az
 * `infrastructure/mail` csak azt tudja, hogyan megy ki egy levél — azt nem,
 * hogy mi áll benne.
 *
 * Mindegyik `Omit<MailMessage, 'to'>`-t ad vissza: a címzettet a hívó tudja,
 * a sablon nem, és így nem lehet véletlenül rossz emberhez küldeni.
 */
export const authMail = {
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
      action: { label: 'Fiókbeállítások', url: `${mailSiteUrl()}/profil/beallitasok` },
    };
  },
};
