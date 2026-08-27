import type { Metadata } from 'next';
import Link from 'next/link';
import { ExternalLink, Users } from 'lucide-react';
import { ensurePermission } from '@/lib/auth/guards';
import { listAdminTeam } from '@/server/admin/team';
import { listPositions } from '@/server/team';
import { formatDate } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/feedback';

export const metadata: Metadata = { title: 'Csapat' };
export const dynamic = 'force-dynamic';

export default async function AdminTeamPage() {
  await ensurePermission('team:write', '/admin/csapat');
  const [members, positions] = await Promise.all([listAdminTeam(), listPositions()]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl">Csapat</h1>
        <p className="mt-1 text-sm text-content-muted">
          {members.length} tag · {positions.length} pozíció. Az inaktív tagok profilja
          megmarad, de nem szerepelnek a nyilvános listán.
        </p>
      </header>

      {members.length === 0 ? (
        <EmptyState
          icon={<Users className="size-6" aria-hidden />}
          title="Nincs csapattag"
          description="Vedd fel az első tagot, hogy a stáblisták kitölthetők legyenek."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {members.map((member) => (
            <li
              key={member.id}
              className="rounded-xl border border-ink-800 bg-ink-900/40 p-4"
            >
              <div className="flex items-start gap-3">
                <Avatar name={member.name} src={member.avatarUrl} size="md" />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-mist-100">
                      {member.name}
                    </span>
                    {member.isFounder && (
                      <Badge tone="warm" size="sm">
                        Alapító
                      </Badge>
                    )}
                    {!member.isActive && (
                      <Badge tone="neutral" size="sm">
                        Inaktív
                      </Badge>
                    )}
                  </div>

                  {member.tagline && (
                    <p className="mt-0.5 truncate text-2xs text-mist-500">{member.tagline}</p>
                  )}

                  <ul className="mt-2 flex flex-wrap gap-1">
                    {member.positions.map((entry) => (
                      <li key={entry.positionId}>
                        <Badge tone={entry.isPrimary ? 'accent' : 'neutral'} size="sm">
                          {entry.position.name}
                        </Badge>
                      </li>
                    ))}
                  </ul>

                  <p className="nums mt-2.5 text-2xs text-mist-600">
                    {member._count.projects} közreműködés
                    {member.joinedAt && ` · csatlakozott ${formatDate(member.joinedAt)}`}
                  </p>
                </div>

                <Link
                  href={`/csapat/${member.slug}`}
                  target="_blank"
                  aria-label={`${member.name} nyilvános profilja`}
                  className="shrink-0 rounded-md p-1.5 text-mist-600 transition-colors hover:bg-ink-800 hover:text-mist-300"
                >
                  <ExternalLink className="size-3.5" aria-hidden />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
