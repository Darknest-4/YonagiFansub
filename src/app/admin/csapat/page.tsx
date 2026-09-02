import type { Metadata } from 'next';
import { ensurePermission } from '@/shared/auth/guards';
import { hasPermission } from '@/shared/auth/permissions';
import { toActor } from '@/shared/auth/session';
import { listAdminTeam } from '@/features/team/admin-service';
import { listPositions } from '@/features/team/queries';
import { TeamManager } from '@/features/team/components/team-manager';

export const metadata: Metadata = { title: 'Csapat' };
export const dynamic = 'force-dynamic';

export default async function AdminTeamPage() {
  const user = await ensurePermission('team:write', '/admin/csapat');
  const actor = toActor(user);

  const [members, positions] = await Promise.all([listAdminTeam(), listPositions()]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl">Csapat</h1>
        <p className="mt-1 text-sm text-content-muted">
          {members.length} tag · {positions.length} pozíció. Ez a nyilvános stáblista — hogy ki
          mit <em>tehet</em> az admin felületen, azt a fiókja szerepköre dönti el a{' '}
          <a
            href="/admin/felhasznalok"
            className="text-bloom-300 underline-offset-4 hover:underline"
          >
            Felhasználók
          </a>{' '}
          oldalon.
        </p>
      </header>

      <TeamManager
        members={members.map((member) => ({
          id: member.id,
          slug: member.slug,
          name: member.name,
          account: member.user,
          tagline: member.tagline,
          bio: member.bio,
          avatarUrl: member.avatarUrl,
          bannerUrl: member.bannerUrl,
          accentColor: member.accentColor,
          socials: (member.socials ?? {}) as Record<string, string>,
          joinedAt: member.joinedAt?.toISOString() ?? null,
          isActive: member.isActive,
          isFounder: member.isFounder,
          sortOrder: member.sortOrder,
          projectCount: member._count.projects,
          /*
            Primary first. The write path reads the primary off position zero,
            so the order has to survive the round trip — sorting it here means
            the form opens showing the same primary the public page groups by.
          */
          positionIds: [...member.positions]
            .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
            .map((entry) => entry.positionId),
        }))}
        positions={positions.map((position) => ({
          id: position.id,
          key: position.key,
          name: position.name,
          color: position.color,
        }))}
        canDelete={hasPermission(actor, 'team:delete')}
      />
    </div>
  );
}
