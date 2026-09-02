import 'server-only';
import { Prisma } from '@prisma/client';
import { db } from '@/infrastructure/db';
import { ConflictError, NotFoundError } from '@/shared/lib/errors';
import { invalidateTeam } from '@/infrastructure/cache';
import type { TeamMemberWriteInput } from '@/lib/validation/schemas';
import { nullable, type MutationContext } from '@/shared/api/mutation-context';

/**
 * Team member writes.
 *
 * Positions are a many-to-many with an `isPrimary` flag that drives the grouping
 * on the public page. The first entry in `positionIds` is taken as primary —
 * order carries meaning here, which is why the form uses a sortable list rather
 * than checkboxes.
 */

const adminTeamArgs = Prisma.validator<Prisma.TeamMemberDefaultArgs>()({
  select: {
    id: true,
    slug: true,
    userId: true,
    name: true,
    tagline: true,
    bio: true,
    avatarUrl: true,
    bannerUrl: true,
    accentColor: true,
    socials: true,
    joinedAt: true,
    leftAt: true,
    isActive: true,
    isFounder: true,
    sortOrder: true,
    createdAt: true,
    deletedAt: true,
    user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
    positions: {
      select: { isPrimary: true, positionId: true, position: { select: { key: true, name: true } } },
    },
    _count: { select: { projects: true } },
  },
});

export type AdminTeamMember = Prisma.TeamMemberGetPayload<typeof adminTeamArgs>;

export async function listAdminTeam(): Promise<AdminTeamMember[]> {
  return db.teamMember.findMany({
    where: { deletedAt: null },
    ...adminTeamArgs,
    orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });
}

export async function getAdminTeamMember(id: string): Promise<AdminTeamMember> {
  const member = await db.teamMember.findFirst({ where: { id }, ...adminTeamArgs });
  if (!member) throw new NotFoundError('A csapattag');
  return member;
}

function toMemberData(input: TeamMemberWriteInput) {
  return {
    slug: input.slug,
    userId: nullable(input.userId),
    name: input.name,
    tagline: nullable(input.tagline),
    bio: nullable(input.bio),
    avatarUrl: nullable(input.avatarUrl),
    bannerUrl: nullable(input.bannerUrl),
    accentColor: nullable(input.accentColor),
    socials: input.socials as Prisma.InputJsonValue,
    joinedAt: nullable(input.joinedAt),
    leftAt: nullable(input.leftAt),
    isActive: input.isActive,
    isFounder: input.isFounder,
    sortOrder: input.sortOrder,
  };
}

function positionRows(positionIds: string[]) {
  return positionIds.map((positionId, index) => ({ positionId, isPrimary: index === 0 }));
}

export interface TeamCandidate {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  /** Set when this account already has a member profile — one apiece. */
  linkedMemberId: string | null;
}

/**
 * Accounts that can be given a team profile.
 *
 * Deliberately narrow: id, handle, display name, avatar, and whether the account
 * is already taken. Picking someone for the credits does not require knowing
 * their email, their role or their account status, and this endpoint is open to
 * `team:write` — which an editor holds and `user:read` is not.
 *
 * Already-linked accounts are returned rather than filtered out, so the picker
 * can show them as unavailable instead of silently hiding somebody the user is
 * actively searching for.
 */
export async function listTeamCandidates(q?: string, limit = 20): Promise<TeamCandidate[]> {
  const users = await db.user.findMany({
    where: {
      deletedAt: null,
      status: { in: ['ACTIVE', 'PENDING'] },
      ...(q
        ? {
            OR: [
              { username: { contains: q, mode: 'insensitive' } },
              { displayName: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      teamMember: { where: { deletedAt: null }, select: { id: true } },
    },
    orderBy: [{ displayName: 'asc' }],
    take: limit,
  });

  return users.map((user) => ({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    linkedMemberId: user.teamMember?.id ?? null,
  }));
}

export async function createTeamMember(
  input: TeamMemberWriteInput,
  context: MutationContext,
): Promise<AdminTeamMember> {
  const existing = await db.teamMember.findUnique({
    where: { slug: input.slug },
    select: { id: true },
  });
  if (existing) throw new ConflictError('Ez a slug már foglalt.');

  if (input.userId) {
    const linked = await db.teamMember.findUnique({
      where: { userId: input.userId },
      select: { id: true },
    });
    if (linked) throw new ConflictError('Ehhez a fiókhoz már tartozik csapattag-profil.');
  }

  const member = await db.teamMember.create({
    data: { ...toMemberData(input), positions: { create: positionRows(input.positionIds) } },
    ...adminTeamArgs,
  });

  invalidateTeam(member.slug);

  await context.audit({
    action: 'CREATE',
    entityType: 'TeamMember',
    entityId: member.id,
    summary: `Csapattag hozzáadva: ${member.name}`,
    after: { name: input.name, positions: input.positionIds },
  });

  return member;
}

export async function updateTeamMember(
  id: string,
  input: TeamMemberWriteInput,
  context: MutationContext,
): Promise<AdminTeamMember> {
  const current = await getAdminTeamMember(id);

  if (input.slug !== current.slug) {
    const clash = await db.teamMember.findUnique({
      where: { slug: input.slug },
      select: { id: true },
    });
    if (clash) throw new ConflictError('Ez a slug már foglalt.');
  }

  if (input.userId && input.userId !== current.userId) {
    const linked = await db.teamMember.findUnique({
      where: { userId: input.userId },
      select: { id: true },
    });
    if (linked) throw new ConflictError('Ehhez a fiókhoz már tartozik csapattag-profil.');
  }

  const member = await db.$transaction(async (tx) => {
    await tx.teamMemberPosition.deleteMany({ where: { teamMemberId: id } });
    return tx.teamMember.update({
      where: { id },
      data: { ...toMemberData(input), positions: { create: positionRows(input.positionIds) } },
      ...adminTeamArgs,
    });
  });

  invalidateTeam(current.slug);
  invalidateTeam(member.slug);

  await context.audit({
    action: 'UPDATE',
    entityType: 'TeamMember',
    entityId: id,
    summary: `Csapattag módosítva: ${member.name}`,
    before: { name: current.name, isActive: current.isActive },
    after: { name: input.name, isActive: input.isActive },
  });

  return member;
}

export async function softDeleteTeamMember(
  id: string,
  context: MutationContext,
): Promise<void> {
  const member = await getAdminTeamMember(id);

  await db.teamMember.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });

  invalidateTeam(member.slug);

  await context.audit({
    action: 'DELETE',
    entityType: 'TeamMember',
    entityId: id,
    summary: `Csapattag törölve: ${member.name}`,
  });
}
