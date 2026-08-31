import { ExternalLink } from 'lucide-react';
import { linkTypeRank, parseSiteLinks } from '@/lib/anime/metadata-display';

/**
 * Official sites and legal streaming pages, as the import found them.
 *
 * Unlike `ExternalLinks`, which builds its URLs from ids we verified, every URL
 * here is a string an upstream API handed us — so `parseSiteLinks` decides which
 * ones are safe to turn into anchors before any of this renders.
 *
 * The list is capped: a popular show carries thirty of these, and a sidebar that
 * scrolls past the episode list helps nobody.
 */

const MAX_LINKS = 8;

export function OfficialLinks({ links }: { links: unknown }) {
  const parsed = parseSiteLinks(links);
  if (parsed.length === 0) return null;

  const ordered = [...parsed]
    .sort((a, b) => linkTypeRank(a.type) - linkTypeRank(b.type))
    .slice(0, MAX_LINKS);

  return (
    <section aria-labelledby="official-links">
      <h2
        id="official-links"
        className="mb-3 text-2xs font-bold tracking-[0.18em] text-mist-500 uppercase"
      >
        Hivatalos oldalak
      </h2>

      <ul className="overflow-hidden rounded-xl border border-ink-800 bg-ink-900/40">
        {ordered.map((link) => (
          <li key={link.url} className="border-b border-ink-800 last:border-b-0">
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm text-mist-300 transition-colors duration-fast hover:bg-ink-850 hover:text-bloom-300"
            >
              <span className="min-w-0 truncate">{link.site}</span>
              {link.type === 'STREAMING' ? (
                <span className="shrink-0 text-2xs text-mist-600">Nézés</span>
              ) : (
                <ExternalLink className="size-3.5 shrink-0 text-mist-600" aria-hidden />
              )}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
