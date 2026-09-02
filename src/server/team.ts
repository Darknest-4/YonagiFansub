import 'server-only';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { CACHE_TAGS, CACHE_TTL, cached } from '@/lib/cache';
import { cache as reactCache } from 'react';

/**
 * Team read model.
 *
 * Members are grouped by their primary position for the public page, because
 * "who does what" is the question visitors actually arrive with — an
 * alphabetical list of names answers nobody's question.
 */

export const teamCardArgs = Prisma.validator<Prisma.TeamMemberDefaultArgs>()({
  select: {
    id: true,
    slug: true,
    name: true,
    tagline: true,
    avatarUrl: true,
    accentColor: true,
    isActive: true,
    isFounder: true,
    joinedAt: true,
    sortOrder: true,
    socials: true,
    positions: {
      select: {
        isPrimary: true,
        position: { select: { key: true, name: true, icon: true, color: true, sortOrder: true } },
      },
    },
    _count: { select: { projects: true } },
  },
});

export type TeamCard = Prisma.TeamMemberGetPayload<typeof teamCardArgs>;

export const listTeam = cached(
  async (includeInactive = false) =>
    db.teamMember.findMany({
      where: { deletedAt: null, ...(includeInactive ? {} : { isActive: true }) },
      ...teamCardArgs,
      orderBy: [{ isFounder: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    }),
  ['team'],
  { tags: [CACHE_TAGS.team], revalidate: CACHE_TTL.long },
);

export const listPositions = cached(
  async () =>
    db.position.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        key: true,
        name: true,
        nameEn: true,
        icon: true,
        color: true,
        sortOrder: true,
        _count: { select: { members: true } },
      },
    }),
  ['positions'],
  { tags: [CACHE_TAGS.team], revalidate: CACHE_TTL.day },
);

/** Buckets members under their primary position, preserving position order. */
export function groupByPosition(
  members: TeamCard[],
): Array<{ key: string; name: string; icon: string | null; color: string | null; members: TeamCard[] }> {
  const groups = new Map<
    string,
    { key: string; name: string; icon: string | null; color: string | null; sortOrder: number; members: TeamCard[] }
  >();

  for (const member of members) {
    const primary =
      member.positions.find((entry) => entry.isPrimary)?.position ??
      member.positions[0]?.position;

    const key = primary?.key ?? 'egyeb';
    const existing = groups.get(key);

    if (existing) {
      existing.members.push(member);
    } else {
      groups.set(key, {
        key,
        name: primary?.name ?? 'Egyéb',
        icon: primary?.icon ?? null,
        color: primary?.color ?? null,
        sortOrder: primary?.sortOrder ?? 999,
        members: [member],
      });
    }
  }

  return [...groups.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ sortOrder: _sortOrder, ...group }) => group);
}

/** One member, memoised per request — metadata, the 404 gate and the page all want it. */
export const getTeamMember = reactCache(async (slug: string) => {
  return db.teamMember.findFirst({
    where: { slug, deletedAt: null },
    select: {
      ...teamCardArgs.select,
      bio: true,
      bannerUrl: true,
      leftAt: true,
      createdAt: true,
      user: { select: { username: true, displayName: true } },
      projects: {
        select: {
          id: true,
          position: { select: { key: true, name: true, color: true } },
          project: {
            select: {
              slug: true,
              title: true,
              coverImageUrl: true,
              type: true,
              status: true,
              publishStatus: true,
              deletedAt: true,
            },
          },
        },
      },
    },
  });
});

export const getPublicTeamMember = cached(
  async (slug: string) => {
    const member = await getTeamMember(slug);
    if (!member) return null;

    // Credits on unpublished projects must not leak through a member profile.
    return {
      ...member,
      projects: member.projects.filter(
        (credit) =>
          credit.project.publishStatus === 'PUBLISHED' && credit.project.deletedAt === null,
      ),
    };
  },
  ['public-team-member'],
  { tags: [CACHE_TAGS.team, CACHE_TAGS.projects], revalidate: CACHE_TTL.medium },
);

export const listFaq = cached(
  async () =>
    db.faqEntry.findMany({
      where: { isPublished: true },
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
      select: { id: true, question: true, answer: true, category: true },
    }),
  ['faq'],
  { tags: [CACHE_TAGS.faq], revalidate: CACHE_TTL.long },
);

export const FAQ_CATEGORY_LABELS: Record<string, string> = {
  general: 'Általános',
  download: 'Nézés',
  projects: 'Projektek',
  team: 'Csapat',
  technical: 'Technikai',
};
