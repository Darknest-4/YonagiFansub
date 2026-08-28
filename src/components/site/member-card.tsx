import Link from 'next/link';
import { Globe, MessageCircle, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import type { TeamCard } from '@/server/team';

/**
 * Social handles are stored as free-form JSON. Only the keys listed here get a
 * link on the card: an icon row is a small space, and an unrecognised key has no
 * icon that would mean anything to a reader.
 *
 * The profile page carries the full list — this is the shortcut, not the record.
 */
const SOCIALS: Record<string, { label: string; url: (handle: string) => string }> = {
  discord: { label: 'Discord', url: (handle) => `https://discord.com/users/${handle}` },
  anilist: { label: 'AniList', url: (handle) => `https://anilist.co/user/${handle}` },
  myanimelist: {
    label: 'MyAnimeList',
    url: (handle) => `https://myanimelist.net/profile/${handle}`,
  },
  x: { label: 'X', url: (handle) => `https://x.com/${handle.replace(/^@/, '')}` },
  website: { label: 'Weboldal', url: (handle) => handle },
};

/**
 * Team member card.
 *
 * The whole card is **not** a link, even though it looks like one tile. The
 * social icons at the bottom go somewhere else entirely, and a link inside a
 * link is invalid HTML that browsers resolve by guessing. So the name carries
 * the navigation and a `::after` overlay stretches its hit area over the card —
 * the tile stays fully clickable, the icons stay clickable, and there is exactly
 * one focus stop for the member plus one per social.
 *
 * Positions are shown as one primary badge rather than every position the member
 * holds. A card listing five roles reads as a list of jobs; the point here is
 * "who is this person", and the profile page is where the full credits live.
 */
export function MemberCard({ member, className }: { member: TeamCard; className?: string }) {
  const accent = member.accentColor ?? '#f761a8';

  const primary =
    member.positions.find((entry) => entry.isPrimary)?.position ?? member.positions[0]?.position;
  const extra = Math.max(0, member.positions.length - 1);

  const socials = Object.entries(
    (member.socials ?? {}) as Record<string, unknown>,
  ).flatMap(([key, value]) =>
    typeof value === 'string' && value.length > 0 && SOCIALS[key]
      ? [{ key, handle: value, config: SOCIALS[key]! }]
      : [],
  );

  return (
    <article
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-xl border border-ink-800 bg-ink-900/50 p-5',
        'transition-[transform,border-color,box-shadow] duration-base ease-out-quint',
        'hover:-translate-y-1 hover:border-bloom-500/40 hover:shadow-e3 motion-reduce:hover:translate-y-0',
        className,
      )}
    >
      {/* Accent wash tied to the member's own colour, so a grid of cards reads as
          people rather than as rows of the same component. */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-24 opacity-40 transition-opacity duration-base group-hover:opacity-70"
        style={{
          background: `radial-gradient(120% 100% at 15% 0%, color-mix(in oklab, ${accent} 32%, transparent), transparent 70%)`,
        }}
      />

      <div className="relative flex items-start justify-between gap-3">
        <Avatar
          name={member.name}
          src={member.avatarUrl}
          size="lg"
          className="ring-2 ring-ink-700 transition-[box-shadow] duration-base group-hover:ring-bloom-500/50"
        />

        {primary && (
          <span
            className="rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-[0.1em] whitespace-nowrap uppercase"
            style={{
              color: primary.color ?? accent,
              borderColor: `color-mix(in oklab, ${primary.color ?? accent} 45%, transparent)`,
              backgroundColor: `color-mix(in oklab, ${primary.color ?? accent} 12%, transparent)`,
            }}
          >
            {primary.name}
          </span>
        )}
      </div>

      <h3 className="relative mt-4 flex items-center gap-1.5 text-base font-semibold text-mist-50">
        <Link
          href={`/csapat/${member.slug}`}
          className="rounded transition-colors duration-fast group-hover:text-bloom-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bloom-400 after:absolute after:inset-0 after:content-['']"
        >
          {member.name}
        </Link>

        {member.isFounder && (
          <Star
            className="size-3.5 shrink-0 fill-ember-400/80 text-ember-400"
            aria-label="Alapító tag"
          />
        )}
      </h3>

      {/* Two lines reserved, not three: taglines run short, and a card that keeps
          a third line empty just to be safe puts a hole above its own footer. */}
      <p className="relative mt-2 mb-4 line-clamp-2 min-h-[2.75rem] text-sm leading-relaxed text-mist-400">
        {member.tagline ?? 'Ez a tag még nem írt magáról bemutatkozót.'}
      </p>

      <div className="relative mt-auto flex items-center justify-between gap-3 border-t border-ink-800 pt-3.5">
        <p className="nums text-2xs text-mist-600">
          {member._count.projects} projekt
          {extra > 0 && <span className="text-mist-700"> · +{extra} pozíció</span>}
        </p>

        {socials.length > 0 && (
          <ul className="flex items-center gap-1">
            {socials.slice(0, 3).map((social) => (
              <li key={social.key}>
                <a
                  href={social.config.url(social.handle)}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  title={social.config.label}
                  /* `relative` lifts each icon above the name's stretched overlay;
                     without it the card link would swallow every one of them. */
                  className="relative grid size-7 place-items-center rounded-md border border-ink-700 bg-ink-850 text-mist-500 transition-colors duration-fast hover:border-bloom-500/40 hover:text-bloom-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bloom-400"
                >
                  {social.key === 'discord' ? (
                    <MessageCircle className="size-3.5" aria-hidden />
                  ) : (
                    <Globe className="size-3.5" aria-hidden />
                  )}
                  <span className="sr-only">
                    {member.name} — {social.config.label}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}
