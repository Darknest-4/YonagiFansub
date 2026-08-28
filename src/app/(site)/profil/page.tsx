import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertCircle, Download, Star } from 'lucide-react';
import { db } from '@/lib/db';
import { ensureAuthenticated } from '@/lib/auth/guards';
import { formatDate, formatRelative } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/feedback';
import { countUnread } from '@/server/notifications';

export const metadata: Metadata = {
  title: 'Profilom',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const user = await ensureAuthenticated('/profil');

  const [favoriteCount, downloadCount, unread, recentFavorites] = await Promise.all([
    db.favorite.count({ where: { userId: user.id } }),
    db.downloadEvent.count({ where: { userId: user.id } }),
    countUnread(user.id),
    db.favorite.findMany({
      where: { userId: user.id, project: { deletedAt: null, publishStatus: 'PUBLISHED' } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        createdAt: true,
        project: {
          select: { slug: true, title: true, coverImageUrl: true, status: true },
        },
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      {!user.emailVerifiedAt && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-warning-500/30 bg-warning-900/25 px-4 py-3.5"
        >
          <AlertCircle className="size-5 shrink-0 text-warning-400" aria-hidden />
          <p className="min-w-0 flex-1 text-sm text-warning-400">
            Az e-mail-címed még nincs megerősítve. Nézd meg a postaládád — a linket a
            regisztrációkor küldtük.
          </p>
        </div>
      )}

      <Card>
        <CardBody className="flex flex-wrap items-center gap-5">
          <Avatar name={user.displayName} src={user.avatarUrl} size="xl" ring />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-xl font-semibold text-mist-50">{user.displayName}</h2>
              <Badge
                tone="accent"
                className="shrink-0"
                title={`Szerepkör: ${user.roleName}`}
              >
                {user.roleName}
              </Badge>
            </div>
            <p className="mt-1 font-mono text-sm text-mist-500">@{user.username}</p>
            <p className="mt-2 text-xs text-mist-600">{user.email}</p>
          </div>

          <ButtonLink href="/profil/beallitasok" variant="secondary" size="sm">
            Profil szerkesztése
          </ButtonLink>
        </CardBody>
      </Card>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Követett projekt" value={favoriteCount} href="/profil/kedvencek" />
        <StatCard label="Letöltés" value={downloadCount} />
        <StatCard label="Olvasatlan értesítés" value={unread} href="/profil/ertesitesek" />
      </dl>

      <Card>
        <CardHeader
          title="Legutóbb követett projektek"
          action={
            favoriteCount > 0 ? (
              <Link
                href="/profil/kedvencek"
                className="text-xs font-medium text-bloom-300 underline-offset-4 hover:underline"
              >
                Összes
              </Link>
            ) : undefined
          }
        />

        <CardBody>
          {recentFavorites.length === 0 ? (
            <EmptyState
              icon={<Star className="size-6" aria-hidden />}
              title="Még nem követsz projektet"
              description="Kövess egy projektet, és szólunk, amint új rész jelenik meg belőle."
              action={{ label: 'Projektek böngészése', href: '/projektek' }}
              compact
            />
          ) : (
            <ul className="space-y-2">
              {recentFavorites.map((favorite) => (
                <li key={favorite.project.slug}>
                  <Link
                    href={`/projektek/${favorite.project.slug}`}
                    className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-ink-850"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-mist-200">
                      {favorite.project.title}
                    </span>
                    <span className="shrink-0 text-2xs text-mist-600">
                      {formatRelative(favorite.createdAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <p className="text-2xs text-mist-700">
        Fiók létrehozva: {formatDate(user.emailVerifiedAt ?? new Date())} ·{' '}
        <Link href="/adatkezeles" className="underline-offset-4 hover:text-mist-500 hover:underline">
          Mit tárolunk rólad?
        </Link>
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href?: string;
}) {
  const content = (
    <>
      <dt className="text-2xs tracking-wide text-mist-500 uppercase">{label}</dt>
      <dd className="nums mt-1.5 font-display text-2xl font-bold text-mist-50">{value}</dd>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="rounded-xl border border-ink-800 bg-ink-900/40 px-4 py-3.5 transition-colors hover:border-bloom-400/30 hover:bg-ink-850"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="rounded-xl border border-ink-800 bg-ink-900/40 px-4 py-3.5">
      <Download className="mb-1 hidden size-4 text-mist-600" aria-hidden />
      {content}
    </div>
  );
}
