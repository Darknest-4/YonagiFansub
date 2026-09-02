import { defineRoute } from '@/shared/api/handler';
import { contactSchema } from '@/features/contact/schemas';
import { submitContactMessage } from '@/features/contact/service';

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
  handler: ({ body, ipHash, userAgent, requestId }) =>
    submitContactMessage(body, { ipHash, userAgent, requestId }),
});
