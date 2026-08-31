import 'server-only';
import { db } from '@/lib/db';
import { CACHE_TAGS, CACHE_TTL, cached } from '@/lib/cache';

/**
 * Public member profiles.
 *
 * ## What a public profile may show
 *
 * The rule here is that a profile shows what the person has already published
 * on this site, and nothing else. A comment they wrote is public the moment
 * they posted it; collecting their comments onto one page reveals nothing new.
 * Their email, their session history, their notification settings and the
 * projects they follow are a different category — those were never shown to
 * anybody, and a profile page is not the place to start.
 *
 * The followed-projects list is the one that looks harmless and is not. What
 * somebody watches is the sort of thing people keep to themselves, and it has
 * never been public here; making it public retroactively would publish it for
 * every existing account without anyone agreeing to it.
 *
 * Suspended, banned and deleted accounts have no profile at all. Answering
 * "this account exists but is banned" is a fact about a person that the site has
 * no reason to broadcast.
 */

/** Comments shown on a profile. Enough to see somebody's voice, not an archive. */
const RECENT_COMMENTS = 10;

const publicProfileArgs = {
  select: {
    id: true,
    username: true,
    displayName: true,
    avatarUrl: true,
    bannerUrl: true,
    bio: true,
    createdAt: true,
    role: { select: { key: true, name: true, color: true } },
    // The team-member link, when this account belongs to somebody on the team.
    // It is what turns "a commenter" into "the person who translated this".
    teamMember: {
      select: { slug: true, tagline: true, isActive: true },
    },
    _count: { select: { comments: true } },
  },
} as const;

async function loadProfile(username: string) {
  const user = await db.user.findFirst({
    where: {
      username: username.toLowerCase(),
      deletedAt: null,
      status: 'ACTIVE',
    },
    ...publicProfileArgs,
  });

  if (!user) return null;

  const comments = await db.comment.findMany({
    where: { userId: user.id, status: 'PUBLISHED', deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: RECENT_COMMENTS,
    select: {
      id: true,
      body: true,
      createdAt: true,
      project: { select: { slug: true, title: true } },
      episode: {
        select: {
          number: true,
          project: { select: { slug: true, title: true } },
        },
      },
      newsPost: { select: { slug: true, title: true } },
    },
  });

  return { ...user, comments };
}

export const getPublicProfile = cached(loadProfile, ['public-profile'], {
  tags: [CACHE_TAGS.team],
  revalidate: CACHE_TTL.short,
});

export type PublicProfile = NonNullable<Awaited<ReturnType<typeof loadProfile>>>;
