import type { Metadata } from 'next';
import { MessageSquare } from 'lucide-react';
import type { Prisma } from '@prisma/client';
import { CommentStatus } from '@prisma/client';
import { ensurePermission } from '@/lib/auth/guards';
import { db } from '@/lib/db';
import { paginationMeta, paginationSchema, toSkipTake } from '@/lib/api/pagination';
import { EmptyState } from '@/components/ui/feedback';
import { CommentModeration } from '@/components/admin/comment-moderation';

export const metadata: Metadata = { title: 'Hozzászólások' };
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminCommentsPage({ searchParams }: { searchParams: SearchParams }) {
  await ensurePermission('comment:moderate', '/admin/hozzaszolasok');

  const raw = await searchParams;
  const statusParam = Array.isArray(raw.status) ? raw.status[0] : raw.status;
  const status =
    statusParam && statusParam in CommentStatus ? (statusParam as CommentStatus) : undefined;

  const pagination = paginationSchema.parse({
    page: Array.isArray(raw.page) ? raw.page[0] : raw.page,
    perPage: 25,
  });

  const where: Prisma.CommentWhereInput = { deletedAt: null, ...(status ? { status } : {}) };

  const [items, total] = await Promise.all([
    db.comment.findMany({
      where,
      select: {
        id: true,
        body: true,
        status: true,
        createdAt: true,
        user: { select: { username: true, displayName: true, avatarUrl: true } },
        project: { select: { slug: true, title: true } },
        episode: { select: { number: true, project: { select: { slug: true, title: true } } } },
        newsPost: { select: { slug: true, title: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      ...toSkipTake(pagination),
    }),
    db.comment.count({ where }),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl">Hozzászólások</h1>
        <p className="mt-1 text-sm text-content-muted">
          Az elrejtés visszavonható: a bejegyzés megmarad, csak nem látszik. A napló
          rögzíti, ki mit tett.
        </p>
      </header>

      {items.length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="size-6" aria-hidden />}
          title="Nincs hozzászólás"
          description="Ezekkel a szűrőkkel nincs találat."
          action={{ label: 'Összes', href: '/admin/hozzaszolasok' }}
        />
      ) : (
        <CommentModeration
          meta={paginationMeta(total, pagination)}
          comments={items.map((comment) => ({
            id: comment.id,
            body: comment.body,
            status: comment.status,
            createdAt: comment.createdAt.toISOString(),
            // A szerző nélküli hozzászólás törölt fiókhoz tartozik: a szöveg
            // megmarad, hogy a rá adott válaszok értelmezhetők maradjanak.
            authorName: comment.user?.displayName ?? 'Törölt felhasználó',
            authorUsername: comment.user?.username ?? null,
            authorAvatar: comment.user?.avatarUrl ?? null,
            target: comment.newsPost
              ? { label: comment.newsPost.title, href: `/hirek/${comment.newsPost.slug}` }
              : comment.episode
                ? {
                    label: `${comment.episode.project.title} – ${comment.episode.number.toString().replace(/\.00$/, '')}. rész`,
                    href: `/projektek/${comment.episode.project.slug}`,
                  }
                : comment.project
                  ? {
                      label: comment.project.title,
                      href: `/projektek/${comment.project.slug}`,
                    }
                  : null,
          }))}
        />
      )}
    </div>
  );
}
