import 'server-only';
import { db } from '@/infrastructure/db';
import { logger } from '@/infrastructure/logger';
import { ForbiddenError } from '@/shared/lib/errors';
import { sendMail } from '@/infrastructure/mail/transport';
import { contactMail } from '@/features/contact/mail';
import { getSettings } from '@/features/settings/service';
import type { contactSchema } from '@/features/contact/schemas';
import type { z } from 'zod';

/**
 * A kapcsolati űrlap feldolgozása.
 *
 * Az üzenet a moderálási sorba kerül, nem a csapat postafiókjába: egy spamhullám
 * így legfeljebb egy listát tölt meg, nem tesz elérhetetlenné egy e-mail-fiókot.
 * A feladó kap visszaigazolást, mert enélkül nem tudná, megérkezett-e.
 */

export type ContactInput = z.infer<typeof contactSchema>;

export interface ContactRequestMeta {
  ipHash: string | null;
  userAgent: string | null;
  requestId: string;
}

export async function submitContactMessage(
  input: ContactInput,
  meta: ContactRequestMeta,
): Promise<{ sent: true }> {
  const settings = await getSettings();
  if (!settings.contactFormEnabled) {
    throw new ForbiddenError('A kapcsolati űrlap jelenleg nem elérhető.');
  }

  /*
    A csapda mező kitöltve: robot. Sikert jelentünk vissza, mert egy őszinte
    elutasításból a küldő megtanulná, mit kell kihagynia legközelebb.
  */
  if (input.website) {
    logger.warn('Honeypot triggered on contact form', { requestId: meta.requestId });
    return { sent: true };
  }

  const message = await db.contactMessage.create({
    data: {
      name: input.name,
      email: input.email,
      subject: input.subject,
      body: input.body,
      category: input.category,
      ipHash: meta.ipHash,
      userAgent: meta.userAgent?.slice(0, 400) ?? null,
    },
    select: { id: true },
  });

  // Csak visszaigazolás — maga az üzenet az admin sorban marad.
  void sendMail({ to: input.email, ...contactMail.contactReceipt(input.name) });

  logger.info('Contact message received', { messageId: message.id, category: input.category });

  return { sent: true };
}
