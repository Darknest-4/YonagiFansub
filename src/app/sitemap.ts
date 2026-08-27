import type { MetadataRoute } from 'next';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { getSettings } from '@/server/settings';

export const revalidate = 3600;

/**
 * Sitemap.
 *
 * Priorities and change frequencies are set from what actually changes: the
 * release feed moves daily, a finished project's page effectively never does.
 * Draft and soft-deleted rows are excluded by the same filters the public pages
 * use, so an unpublished project can never be discovered through the sitemap.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.NEXT_PUBLIC_SITE_URL;
  const settings = await getSettings();

  // With indexing disabled we still serve a valid sitemap, but an empty one.
  if (!settings.indexingEnabled) return [];

  const [projects, episodes, posts, members] = await Promise.all([
    db.project.findMany({
      where: { deletedAt: null, publishStatus: 'PUBLISHED' },
      select: { slug: true, updatedAt: true, status: true },
      orderBy: { updatedAt: 'desc' },
      take: 5000,
    }),
    db.episode.findMany({
      where: {
        deletedAt: null,
        status: 'RELEASED',
        project: { deletedAt: null, publishStatus: 'PUBLISHED' },
      },
      select: { number: true, updatedAt: true, project: { select: { slug: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 20000,
    }),
    db.newsPost.findMany({
      where: { deletedAt: null, status: 'PUBLISHED' },
      select: { slug: true, updatedAt: true },
      orderBy: { publishedAt: 'desc' },
      take: 2000,
    }),
    db.teamMember.findMany({
      where: { deletedAt: null, isActive: true },
      select: { slug: true, updatedAt: true },
    }),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: base, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${base}/projektek`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/kiadasok`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${base}/hirek`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${base}/csapat`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${base}/gyik`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/kapcsolat`, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${base}/csatlakozz`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/adatkezeles`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${base}/felhasznalasi-feltetelek`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${base}/dmca`, changeFrequency: 'yearly', priority: 0.3 },
  ];

  return [
    ...staticRoutes,

    ...projects.map((project) => ({
      url: `${base}/projektek/${project.slug}`,
      lastModified: project.updatedAt,
      // A finished series stops changing; an ongoing one gets a new episode weekly.
      changeFrequency: project.status === 'ONGOING' ? ('daily' as const) : ('monthly' as const),
      priority: project.status === 'ONGOING' ? 0.8 : 0.6,
    })),

    ...episodes.map((episode) => ({
      url: `${base}/projektek/${episode.project.slug}/${episode.number.toString().replace(/\.00$/, '')}`,
      lastModified: episode.updatedAt,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    })),

    ...posts.map((post) => ({
      url: `${base}/hirek/${post.slug}`,
      lastModified: post.updatedAt,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),

    ...members.map((member) => ({
      url: `${base}/csapat/${member.slug}`,
      lastModified: member.updatedAt,
      changeFrequency: 'monthly' as const,
      priority: 0.4,
    })),
  ];
}
