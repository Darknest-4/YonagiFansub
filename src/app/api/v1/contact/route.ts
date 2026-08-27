import { defineRoute } from '@/lib/api/handler';
import { contactSchema } from '@/lib/validation/schemas';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { ForbiddenError } from '@/lib/errors';
import { mailTemplates, sendMail } from '@/lib/mail';
import { getSettings } from '@/server/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Contact form.
 *
 * Three layers of abuse control, cheapest first: a honeypot field, a strict
 * per-IP rate limit (3/hour), and a length-bounded schema. Everything that gets
 * through is stored for the moderation queue rather than emailed onward, so a
 * spam wave cannot flood the team's inbox.
 */
export const POST = defineRoute({
  auth: 'public',
  rateLimit: 'contact:submit',
  body: contactSchema,
  async handler({ body, ipHash, userAgent, requestId }) {
    const settings = await getSettings();
    if (!settings.contactFormEnabled) {
      throw new ForbiddenError('A kapcsolati űrlap jelenleg nem elérhető.');
    }

    if (body.website) {
      logger.warn('Honeypot triggered on contact form', { requestId });
      return { sent: true };
    }

    const message = await db.contactMessage.create({
      data: {
        name: body.name,
        email: body.email,
        subject: body.subject,
        body: body.body,
        category: body.category,
        ipHash,
        userAgent: userAgent?.slice(0, 400) ?? null,
      },
      select: { id: true },
    });

    // Receipt only – the message itself stays in the admin queue.
    void sendMail({ to: body.email, ...mailTemplates.contactReceipt(body.name) });

    logger.info('Contact message received', { messageId: message.id, category: body.category });

    return { sent: true };
  },
});
