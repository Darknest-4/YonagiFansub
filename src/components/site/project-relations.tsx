import Link from 'next/link';
import { ArrowRight, ExternalLink } from 'lucide-react';
import { db } from '@/lib/db';
import { RELATION_LABELS, parseRelations, relationRank } from '@/lib/anime/metadata-display';

/**
 * Prequels, sequels and side stories.
 *
 * The most useful thing the metadata import brings back, and the one a viewer
 * asks for most often: "is there a second season, and do you have it?" The
 * relation list arrives from AniList as a set of ids, and those ids are the
 * bridge — a related entry whose `anilistId` or `malId` matches a project we
 * have becomes an internal link, and everything else is shown as context
 * without pretending to be one.
 *
 * That distinction is the whole point. A grid of titles that all look clickable
 * but half of which go nowhere is worse than no list; here the ones we sub link
 * to their page, and the rest read as "this exists, we have not done it".
 */
export async function ProjectRelations({
  relations,
  currentSlug,
}: {
  relations: unknown;
  currentSlug: string;
}) {
  const entries = parseRelations(relations);
  if (entries.length === 0) return null;

  const anilistIds = entries.map((entry) => entry.anilistId).filter((id): id is number => id !== null);
  const malIds = entries.map((entry) => entry.malId).filter((id): id is number => id !== null);

  // One query for the whole list rather than one per entry: a long-running show
  // can carry twenty relations, and twenty round trips to render a sidebar is
  // not a trade worth making.
  const known =
    anilistIds.length + malIds.length === 0
      ? []
      : await db.project.findMany({
          where: {
            deletedAt: null,
            publishStatus: 'PUBLISHED',
            slug: { not: currentSlug },
            OR: [
              ...(anilistIds.length ? [{ anilistId: { in: anilistIds } }] : []),
              ...(malIds.length ? [{ malId: { in: malIds } }] : []),
            ],
          },
          select: { slug: true, title: true, anilistId: true, malId: true },
        });

  const bySource = new Map<string, { slug: string; title: string }>();
  for (const project of known) {
    if (project.anilistId) bySource.set(`a:${project.anilistId}`, project);
    if (project.malId) bySource.set(`m:${project.malId}`, project);
  }

  const resolved = entries
    .map((entry) => ({
      ...entry,
      ours:
        (entry.anilistId ? bySource.get(`a:${entry.anilistId}`) : undefined) ??
        (entry.malId ? bySource.get(`m:${entry.malId}`) : undefined) ??
        null,
    }))
    // Ours first, then by relation type: a reader looking for the next season
    // should not have to scan past six specials to find it.
    .sort((a, b) => {
      if (Boolean(a.ours) !== Boolean(b.ours)) return a.ours ? -1 : 1;
      return relationRank(a.relation) - relationRank(b.relation);
    });

  return (
    <section aria-labelledby="relations">
      <h2
        id="relations"
        className="mb-3 text-2xs font-bold tracking-[0.18em] text-mist-500 uppercase"
      >
        Kapcsolódó címek
      </h2>

      <ul className="overflow-hidden rounded-xl border border-ink-800 bg-ink-900/40">
        {resolved.map((entry) => {
          const label = RELATION_LABELS[entry.relation] ?? RELATION_LABELS.OTHER;

          const inner = (
            <>
              <span className="min-w-0 flex-1">
                <span className="block text-2xs text-mist-600">{label}</span>
                <span className="block truncate text-sm text-mist-200">{entry.title}</span>
              </span>
              {entry.ours ? (
                <ArrowRight className="size-3.5 shrink-0 text-bloom-400" aria-hidden />
              ) : (
                <ExternalLink className="size-3.5 shrink-0 text-mist-700" aria-hidden />
              )}
            </>
          );

          return (
            <li
              key={`${entry.relation}-${entry.anilistId ?? entry.malId ?? entry.title}`}
              className="border-b border-ink-800 last:border-b-0"
            >
              {entry.ours ? (
                <Link
                  href={`/projektek/${entry.ours.slug}`}
                  className="flex items-center gap-3 px-3.5 py-2.5 transition-colors duration-fast hover:bg-ink-850"
                >
                  {inner}
                </Link>
              ) : entry.anilistId ? (
                <a
                  href={`https://anilist.co/anime/${entry.anilistId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-3.5 py-2.5 opacity-70 transition-opacity duration-fast hover:opacity-100"
                >
                  {inner}
                </a>
              ) : (
                <span className="flex items-center gap-3 px-3.5 py-2.5 opacity-70">{inner}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
