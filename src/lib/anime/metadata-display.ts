/**
 * Turning imported metadata into something safe to render.
 *
 * The `relations` and `externalLinks` columns are `Json`, filled by whatever
 * AniList and Jikan returned. Prisma types them as `JsonValue`, which is honest:
 * nothing guarantees the shape, the upstream can change it without telling us,
 * and an older row may predate a field. So every value is narrowed here rather
 * than trusted at the point of use.
 *
 * The URL check matters most. These strings become anchors, and a `javascript:`
 * URL in an `href` is script execution on our origin — which would make a
 * third-party API able to inject script into our pages. `new URL()` decides,
 * not a regex: a parser agrees with the browser about what a URL is, and a
 * regex is exactly how these get through.
 *
 * Both functions live outside the components that render them so they can be
 * tested as the pure functions they are, without a DOM or a database.
 */

export interface RelationEntry {
  relation: string;
  anilistId: number | null;
  malId: number | null;
  title: string;
}

export interface SiteLink {
  site: string;
  url: string;
  type: string;
}

/** AniList relation types, in the order a reader cares about them. */
export const RELATION_LABELS: Record<string, string> = {
  PREQUEL: 'Előzmény',
  SEQUEL: 'Folytatás',
  PARENT: 'Fősorozat',
  SIDE_STORY: 'Mellékszál',
  SPIN_OFF: 'Spin-off',
  ALTERNATIVE: 'Alternatív változat',
  SUMMARY: 'Összefoglaló',
  SPECIAL: 'Special',
  OTHER: 'Kapcsolódó',
};

const RELATION_ORDER = Object.keys(RELATION_LABELS);

/** Sort rank for a relation type; anything unrecognised sorts last. */
export function relationRank(relation: string): number {
  const index = RELATION_ORDER.indexOf(relation);
  return index === -1 ? RELATION_ORDER.length : index;
}

/** AniList's link `type` values, in the order a reader cares about them. */
const LINK_TYPE_ORDER = ['STREAMING', 'OFFICIAL', 'INFO', 'SOCIAL'];

export function linkTypeRank(type: string): number {
  const index = LINK_TYPE_ORDER.indexOf(type);
  return index === -1 ? LINK_TYPE_ORDER.length : index;
}

/**
 * Narrows the `relations` column. An entry without a title is dropped — there
 * would be nothing to render — but a missing id is fine: it becomes a plain
 * line of context instead of a link.
 */
export function parseRelations(value: unknown): RelationEntry[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const record = entry as Record<string, unknown>;
    if (typeof record.title !== 'string' || typeof record.relation !== 'string') return [];

    return [
      {
        relation: record.relation,
        title: record.title,
        anilistId: typeof record.anilistId === 'number' ? record.anilistId : null,
        malId: typeof record.malId === 'number' ? record.malId : null,
      },
    ];
  });
}

/**
 * Narrows the `externalLinks` column, keeping only absolute `http(s)` URLs and
 * collapsing duplicates. A missing name falls back to the host, which is
 * usually the more recognisable label anyway.
 */
export function parseSiteLinks(value: unknown): SiteLink[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();

  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const record = entry as Record<string, unknown>;
    if (typeof record.url !== 'string') return [];

    let parsed: URL;
    try {
      parsed = new URL(record.url);
    } catch {
      return [];
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return [];
    if (seen.has(parsed.href)) return [];
    seen.add(parsed.href);

    return [
      {
        url: parsed.href,
        site: typeof record.site === 'string' && record.site.trim() ? record.site : parsed.hostname,
        type: typeof record.type === 'string' ? record.type : 'INFO',
      },
    ];
  });
}
