import type { Metadata } from 'next';
import { ensurePermission } from '@/lib/auth/guards';
import { hasPermission } from '@/lib/auth/permissions';
import { toActor } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { paginationMeta, paginationSchema, toSkipTake } from '@/lib/api/pagination';
import { contactQuerySchema } from '@/lib/validation/schemas';
import { EmptyState } from '@/components/ui/feedback';
import { ContactInbox } from '@/components/admin/contact-inbox';
import type { Prisma } from '@prisma/client';

export const metadata: Metadata = { title: 'Üzenetek' };
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminContactPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await ensurePermission('contact:read', '/admin/uzenetek');

  const raw = await searchParams;
  const flat = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );

  const parsed = contactQuerySchema.safeParse(flat);
  const filters = parsed.success ? parsed.data : contactQuerySchema.parse({});
  const pagination = paginationSchema.parse({ page: filters.page, perPage: 25 });

  const where: Prisma.ContactMessageWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.category) where.category = filters.category;
  if (filters.q) {
    where.OR = [
      { subject: { contains: filters.q, mode: 'insensitive' } },
      { name: { contains: filters.q, mode: 'insensitive' } },
      { email: { contains: filters.q, mode: 'insensitive' } },
    ];
  }

  const [items, total] = await Promise.all([
    db.contactMessage.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        subject: true,
        body: true,
        category: true,
        status: true,
        internalNote: true,
        createdAt: true,
        handledAt: true,
        handledBy: { select: { displayName: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      ...toSkipTake(pagination),
    }),
    db.contactMessage.count({ where }),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl">Beérkezett üzenetek</h1>
        <p className="mt-1 text-sm text-content-muted">
          A kapcsolati űrlapon érkezett megkeresések. A válaszokat e-mailben küldd — itt a
          státuszt és a belső jegyzetet vezesd.
        </p>
      </header>

      {items.length === 0 ? (
        <EmptyState
          title="Nincs üzenet"
          description="Ezekkel a szűrőkkel nincs találat."
          action={{ label: 'Összes üzenet', href: '/admin/uzenetek' }}
        />
      ) : (
        <ContactInbox
          canWrite={hasPermission(toActor(user), 'contact:write')}
          meta={paginationMeta(total, pagination)}
          messages={items.map((message) => ({
            id: message.id,
            name: message.name,
            email: message.email,
            subject: message.subject,
            body: message.body,
            category: message.category,
            status: message.status,
            internalNote: message.internalNote,
            createdAt: message.createdAt.toISOString(),
            handledAt: message.handledAt?.toISOString() ?? null,
            handledBy: message.handledBy?.displayName ?? null,
          }))}
        />
      )}
    </div>
  );
}
