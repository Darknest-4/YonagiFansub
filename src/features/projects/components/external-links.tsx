import { ExternalLink } from 'lucide-react';

/**
 * Links to the databases a viewer might want to cross-check.
 *
 * Built from the ids stored on the project, never from a free-text URL field:
 * an id is verifiable, a pasted URL is a place for a typo or a redirect to
 * somewhere we did not intend. Only the entries with an id are rendered — a list
 * of dead links is worse than a shorter list.
 *
 * `noopener noreferrer` on every one: `noopener` because a `target="_blank"`
 * link hands the opened page a handle to ours without it, and `noreferrer`
 * because which of our pages someone came from is not those sites' business.
 */
export function ExternalLinks({
  malId,
  anilistId,
  title,
}: {
  malId: number | null;
  anilistId: number | null;
  title: string;
}) {
  const links = [
    malId ? { label: 'MyAnimeList', href: `https://myanimelist.net/anime/${malId}` } : null,
    anilistId ? { label: 'AniList', href: `https://anilist.co/anime/${anilistId}` } : null,
    {
      label: 'Anime News Network',
      href: `https://www.animenewsnetwork.com/search?q=${encodeURIComponent(title)}`,
    },
  ].filter((link): link is { label: string; href: string } => link !== null);

  if (links.length === 0) return null;

  return (
    <section aria-labelledby="external-links">
      <h2
        id="external-links"
        className="mb-3 text-2xs font-bold tracking-[0.18em] text-mist-500 uppercase"
      >
        Kapcsolódó oldalak
      </h2>

      <ul className="overflow-hidden rounded-xl border border-ink-800 bg-ink-900/40">
        {links.map((link) => (
          <li key={link.label} className="border-b border-ink-800 last:border-b-0">
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm text-mist-300 transition-colors duration-fast hover:bg-ink-850 hover:text-bloom-300"
            >
              {link.label}
              <ExternalLink className="size-3.5 shrink-0 text-mist-600" aria-hidden />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
