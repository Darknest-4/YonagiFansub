import Link from 'next/link';
import { Logo } from '@/shared/layout/logo';
import {
  FOOTER_SECTIONS,
  disabledNavFeatures,
  visibleNav,
} from '@/shared/layout/nav-config';
import { getPublicSettings } from '@/features/settings/service';
import { getPublicStats } from '@/features/stats/service';
import { formatCount } from '@/shared/lib/utils';

/**
 * Site footer.
 *
 * Doubles as the site's secondary navigation and as its legal surface. The live
 * counters are a deliberate choice: they are cheap (one cached aggregate) and
 * they tell a visitor at a glance that the group is active — the single most
 * important signal for a fansub.
 */
export async function SiteFooter() {
  const [settings, stats] = await Promise.all([getPublicSettings(), getPublicStats()]);
  const year = new Date().getFullYear();

  /*
    The same filtering the header does. A footer column is the one place a
    switched-off page is most likely to survive a redesign unnoticed, because
    nobody scrolls to the bottom to check their own work.
  */
  const off = disabledNavFeatures(settings);
  const sections = FOOTER_SECTIONS.map((section) => ({
    ...section,
    items: visibleNav(section.items, off),
  }));

  const socials = [
    { label: 'Discord', href: settings.discordUrl },
    { label: 'X', href: settings.xUrl },
    { label: 'YouTube', href: settings.youtubeUrl },
  ].filter((item): item is { label: string; href: string } => Boolean(item.href));

  return (
    /*
      The bottom padding clears the fixed mobile tab bar (its own height plus the
      home-indicator inset). Without it the last line of the footer sits under a
      floating bar, which reads as content that got cut off rather than content
      that ended. It falls away at `lg`, where the bar is not rendered.
    */
    <footer className="relative mt-24 border-t border-ink-800 bg-ink-925 pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-0">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-px h-px bg-linear-to-r from-transparent via-bloom-400/40 to-transparent"
      />

      <div className="container-content py-14 lg:py-16">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_2fr]">
          <div>
            <Logo size="lg" />

            <p className="mt-5 max-w-sm text-sm leading-relaxed text-content-muted">
              {settings.siteTagline}
            </p>

            <dl className="mt-7 grid max-w-sm grid-cols-3 gap-4">
              <Stat label="Projekt" value={stats.projects} />
              <Stat label="Epizód" value={stats.episodes} />
              <Stat label="Lejátszás" value={stats.views} />
            </dl>

            {socials.length > 0 && (
              <ul className="mt-7 flex flex-wrap gap-2">
                {socials.map((social) => (
                  <li key={social.label}>
                    <a
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center rounded-lg border border-ink-700 bg-ink-900 px-3.5 py-2 text-xs font-medium text-mist-300 transition-colors duration-fast hover:border-bloom-400/40 hover:text-bloom-200"
                    >
                      {social.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <nav aria-label="Lábléc navigáció">
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
              {sections.map((section) => (
                <div key={section.title}>
                  <h2 className="mb-3.5 text-2xs font-bold tracking-[0.18em] text-mist-500 uppercase">
                    {section.title}
                  </h2>
                  <ul className="space-y-2.5">
                    {section.items.map((item) => (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className="text-sm text-mist-400 transition-colors duration-fast hover:text-bloom-200"
                        >
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-ink-800 pt-7 text-xs text-mist-500 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex flex-wrap items-center gap-2">
            <span>
              © {year} {settings.siteName}. Rajongói fordítás, nem hivatalos kiadás.
            </span>

            {/*
              The beta bar at the top scrolls away; this does not. Somebody who
              landed mid-page, or who has read past the strip a dozen times, can
              still find out here what state the site is in — which is the point
              of saying it at all.
            */}
            {settings.betaMode && (
              <span className="rounded-full bg-warning-500/12 px-2 py-0.5 text-2xs font-bold tracking-[0.14em] text-warning-400 uppercase">
                Béta
              </span>
            )}
          </p>

          <p className="max-w-xl leading-relaxed sm:text-right">
            A feliratok szabadon, díjmentesen érhetők el. A jogtulajdonosok
            megkeresését a{' '}
            {/* Aláhúzva, nem csak elszínezve: a körülötte lévő szöveggel szemben a
                kontrasztja 2.09:1, ami alatta van a 3:1-es küszöbnek — színvakon
                és halvány kijelzőn a link észrevehetetlen lenne. */}
            <Link href="/dmca" className="text-mist-300 underline underline-offset-4 decoration-mist-500 hover:decoration-mist-300">
              jogi nyilatkozatban
            </Link>{' '}
            leírt módon várjuk.
          </p>
        </div>

        {/* A free line for whatever the team wants down here — a thank-you, a
            credit, a note about a hiatus. Omitted entirely when unset, rather
            than leaving an empty row that changes the footer's height. */}
        {settings.footerNote && (
          <p className="mt-5 text-xs leading-relaxed text-mist-600">{settings.footerNote}</p>
        )}
      </div>
    </footer>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-2xs tracking-wide text-mist-500 uppercase">{label}</dt>
      <dd className="nums mt-1 font-display text-xl font-bold text-mist-50">
        {formatCount(value)}
      </dd>
    </div>
  );
}
