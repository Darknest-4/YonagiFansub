import Link from 'next/link';
import { FlaskConical } from 'lucide-react';

/**
 * The "this site is still being built" strip.
 *
 * Driven by the `betaMode` setting, off by default, and the whole point of it
 * is honesty: a visitor who hits a half-finished page and was never told the
 * site is in beta concludes it is broken. One who was told concludes it is
 * early, and those are very different opinions of the same bug.
 *
 * ## Not dismissible
 *
 * The obvious addition here is an X that hides it, and it is the wrong call
 * twice over. Practically: the state has to live in `localStorage`, which the
 * server cannot read, so either the bar flashes in for somebody who dismissed
 * it or it pops in after hydration and shoves the whole page down — a layout
 * shift on every single navigation, for a bar three lines tall. And in
 * principle: the thing this says stays true until the admin decides it is not,
 * and that is exactly what the setting is. The off switch belongs to the person
 * who knows whether the site is still in beta, not to the visitor.
 *
 * So it is kept slim instead — small type, no image, no animation, and it wraps
 * to at most three short lines on a 390px phone — and it stops appearing the
 * moment somebody flips `betaMode` off.
 *
 * ## Where the report link goes
 *
 * `betaFeedbackUrl` if it is set (a Discord invite, a form, an issue tracker),
 * and the contact page if it is not. A beta notice with nowhere to send the bug
 * is an apology, not an invitation, and the fallback means the link is never
 * missing just because nobody filled in a setting.
 */
export function BetaBanner({
  message,
  feedbackUrl,
}: {
  message: string;
  feedbackUrl: string;
}) {
  const text =
    message.trim() ||
    'Az oldal béta állapotban van: még építjük, így hibák és hiányzó funkciók előfordulhatnak.';

  // An absolute URL leaves the site, so it opens in a new tab and carries the
  // rel that stops the target page from touching this one. A relative one is a
  // normal client-side navigation.
  const external = /^https?:\/\//i.test(feedbackUrl);
  const href = feedbackUrl.trim() || '/kapcsolat';

  /*
    Only the 400/500/900 steps exist for the status hues in the theme — there is
    no `warning-200`, and Tailwind emits nothing at all for a token it cannot
    resolve, so a class like that would silently leave the text inheriting
    whatever colour it sat on. The hover state changes the underline rather than
    the text colour for the same reason: there is no lighter step to move to.
  */
  const linkClass =
    'shrink-0 font-semibold text-warning-400 underline decoration-warning-400/40 underline-offset-4 transition-[text-decoration-color] duration-fast hover:decoration-warning-400';

  return (
    <div className="relative z-50 border-b border-warning-500/20 bg-warning-900/30">
      <div className="container-wide flex flex-wrap items-center justify-center gap-x-3 gap-y-1 py-2 text-center text-2xs text-mist-300 sm:text-sm">
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-warning-500/15 px-2 py-0.5 text-2xs font-bold tracking-[0.14em] text-warning-400 uppercase">
          <FlaskConical className="size-3" aria-hidden />
          Béta
        </span>

        <span className="min-w-0">{text}</span>

        {external ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
            Hibát találtál?
          </a>
        ) : (
          <Link href={href} className={linkClass}>
            Hibát találtál?
          </Link>
        )}
      </div>
    </div>
  );
}
