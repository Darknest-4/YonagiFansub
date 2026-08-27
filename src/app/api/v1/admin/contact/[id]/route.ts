import { defineRoute, idParams } from '@/lib/api/handler';
import { contactUpdateSchema } from '@/lib/validation/schemas';
import { db } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';
import { recordAudit } from '@/lib/api/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const PATCH = defineRoute({
  auth: 'contact:write',
  rateLimit: 'admin:write',
  params: idParams,
  body: contactUpdateSchema,
  async handler({ params, body, user, ipHash, userAgent, requestId }) {
    const current = await db.contactMessage.findUnique({
      where: { id: params.id },
      select: { id: true, subject: true, status: true },
    });
    if (!current) throw new NotFoundError('Az üzenet');

    const message = await db.contactMessage.update({
      where: { id: params.id },
      data: {
        status: body.status,
        internalNote: body.internalNote,
        // Stamp the handler on the first non-NEW transition, and keep it after.
        handledById: body.status === 'NEW' ? null : user!.id,
        handledAt: body.status === 'NEW' ? null : new Date(),
      },
      select: { id: true, status: true, handledAt: true },
    });

    await recordAudit({
      actorId: user!.id,
      actorLabel: `${user!.displayName} (@${user!.username})`,
      action: 'UPDATE',
      entityType: 'ContactMessage',
      entityId: params.id,
      summary: `Üzenet státusza: ${current.status} → ${body.status} (${current.subject})`,
      ipHash,
      userAgent,
      requestId,
    });

    return message;
  },
});
